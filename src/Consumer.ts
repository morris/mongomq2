import { Collection, Filter, ObjectId, UpdateFilter, WithId } from "mongodb";
import { ErrorEvents } from "./ErrorEvents";
import { PromiseTracker } from "./PromiseTracker";
import { Timeout } from "./Timeout";
import { TypedEventEmitter } from "./TypedEventEmitter";
import { WithOptionalObjectId } from "./WithOptionalObjectId";

export interface ConsumerOptions<TMessage extends WithOptionalObjectId> {
  /**
   * MongoDB filter for messages to be consumed.
   */
  filter?: Filter<TMessage>;

  /**
   * Consumer group.
   * Defaults to the collection name.
   */
  group?: string;

  /**
   * Maximum number of messages to be consumed concurrently for this Consumer.
   * Defaults to 1.
   */
  concurrency?: number;

  /**
   * Minimum number of seconds to hide messages from other consumers after receiving.
   * Set at least to 2x of the maximum workload time for message consumption.
   * Defaults to 2 seconds.
   */
  visibilityTimeoutSeconds?: number;

  /**
   * Minimum number of seconds before a published message may be consumed.
   * Defaults to zero.
   */
  visibilityDelaySeconds?: number;

  /**
   * Maximum number of seconds to poll for past messages to consume.
   * Defaults to 3600 seconds (1 hour).
   */
  maxVisibilitySeconds?: number;

  /**
   * Maximum number of retries per message.
   * Defaults to 1.
   */
  maxRetries?: number;

  /**
   * Polling interval in milliseconds.
   * Defaults to 1000 milliseconds.
   */
  pollMs?: number;
}

export interface ConsumerEvents<TMessage extends WithOptionalObjectId>
  extends ErrorEvents<TMessage> {
  drained: () => void;
}

export type ConsumerCallback<TMessage extends WithOptionalObjectId> = (
  message: WithId<TMessage>,
) => void | Promise<void>;

export class Consumer<
  TMessage extends WithOptionalObjectId,
> extends TypedEventEmitter<ConsumerEvents<TMessage>> {
  protected collection: Collection<TMessage>;
  protected filter: Filter<TMessage>;
  protected group: string;
  protected concurrency: number;
  protected visibilityTimeoutSeconds: number;
  protected visibilityDelaySeconds: number;
  protected maxVisibilitySeconds: number;
  protected maxRetries: number;
  protected pollMs: number;
  protected callback: ConsumerCallback<TMessage>;
  protected visibilityKey: string;
  protected retryKey: string;
  protected ackKey: string;
  protected nextTimeout = new Timeout(() => this.next());
  protected seekTimeout = new Timeout(() => this.seek());
  protected pending = 0;
  protected minId: ObjectId;
  protected promises = new PromiseTracker();
  protected closed = false;

  constructor(
    collection: Collection<TMessage>,
    callback: ConsumerCallback<TMessage>,
    options: ConsumerOptions<TMessage> = {},
  ) {
    super();

    this.collection = collection;
    this.callback = callback;
    this.filter = options.filter ?? {};
    this.group = options.group ?? collection.collectionName;
    this.concurrency = options.concurrency ?? 1;
    this.visibilityTimeoutSeconds = options.visibilityTimeoutSeconds ?? 2;
    this.visibilityDelaySeconds = options.visibilityDelaySeconds ?? 0;
    this.maxVisibilitySeconds = options.maxVisibilitySeconds ?? 60 * 60;
    this.maxRetries = options.maxRetries ?? 1;
    this.pollMs = options.pollMs ?? 1000;

    this.visibilityKey = `_c.${this.group}.v`;
    this.retryKey = `_c.${this.group}.r`;
    this.ackKey = `_c.${this.group}.a`;

    this.minId = ObjectId.createFromTime(
      Math.floor(Date.now() / 1000) - this.maxVisibilitySeconds,
    );
  }

  /**
   * Starts the consumer.
   *
   * - Consumes future and past matching messages.
   * - Per `group`, each matching message is consumed by at most one consumer.
   * - Events are consumed at-least-once per `group`.
   * - Order of message consumption is not guaranteed.
   * - Will write metadata to messages under `message._c.<group>.*`.
   * - The underlying messages collection must only use auto-generated MongoDB Object IDs.
   *
   * See constructor options for details.
   */
  async start() {
    await this.seek();
    await this.next();
  }

  /**
   * Waits until the consumer is drained,
   * i.e. it could not receive any consumable message.
   */
  async drain(timeoutMs = 5000) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Consumer did not drain (timed out after ${timeoutMs} milliseconds)`,
          ),
        );
      }, timeoutMs);

      this.once("drained", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    this.nextTimeout.clear();
    this.seekTimeout.clear();

    await this.promises.all();
  }

  protected async next() {
    if (this.closed) return;
    if (this.pending >= this.concurrency) return;

    this.pending += 1;

    if (this.pending < this.concurrency) {
      // fast poll if maximum concurrency is not reached
      this.nextTimeout.set(0, 10);
    }

    try {
      await this.promises.run(async () => {
        const message = await this.receive();

        if (message) {
          try {
            await this.callback(message);
            await this.ack(message);

            // fast poll after successfully consumed message
            this.nextTimeout.set(0, 10);
          } catch (err) {
            this.emit("error", err as Error, message as TMessage);
          }
        } else {
          this.emit("drained");
        }
      });
    } catch (err) {
      this.emit("error", err as Error);
    }

    this.pending -= 1;

    if (!this.nextTimeout.isSet()) {
      this.nextTimeout.set(this.pollMs, this.pollMs * 1.5);
    }
  }

  protected async receive() {
    const now = Date.now();
    const minId = this.minId;
    const maxId =
      this.visibilityDelaySeconds > 0
        ? ObjectId.createFromTime(
            Math.floor(now / 1000) - this.visibilityDelaySeconds,
          )
        : undefined;

    const result = await this.collection.findOneAndUpdate(
      {
        $and: [
          this.filter,
          {
            _id: maxId ? { $gte: minId, $lt: maxId } : { $gte: minId },
            [this.ackKey]: { $exists: false },
          },
          {
            $or: [
              {
                [this.visibilityKey]: { $exists: false },
              },
              {
                [this.visibilityKey]: { $lt: now },
                [this.retryKey]: { $lte: this.maxRetries },
              },
            ],
          },
        ],
      } as UpdateFilter<TMessage>,
      {
        $set: {
          [this.visibilityKey]: now + this.visibilityTimeoutSeconds * 1000,
        },
        $inc: {
          [this.retryKey]: 1,
        },
      } as unknown as UpdateFilter<TMessage>,
      { includeResultMetadata: true } as never, // mongodb@6 compat
    );

    return result.value;
  }

  protected async ack(message: WithId<TMessage>) {
    await this.collection.updateOne(
      { _id: message._id } as Filter<TMessage>,
      {
        $set: { [this.ackKey]: Date.now() },
      } as unknown as UpdateFilter<TMessage>,
    );
  }

  protected async seek() {
    if (this.closed) return;

    try {
      const message = await this.collection.findOne(
        {
          $and: [
            this.filter,
            {
              _id: { $gte: this.minId },
              [this.ackKey]: { $exists: false },
            },
            {
              $or: [
                { [this.retryKey]: { $exists: false } },
                { [this.retryKey]: { $lte: this.maxRetries } },
              ],
            },
          ],
        } as Filter<TMessage>,
        {
          projection: { _id: 1 },
          sort: { _id: 1 },
          readPreference: "secondaryPreferred",
        },
      );

      if (message) {
        this.minId = message._id as ObjectId;
      } else {
        this.minId = ObjectId.createFromTime(
          Math.floor(Date.now() / 1000) - this.visibilityTimeoutSeconds * 2,
        );
      }
    } catch (err) {
      this.emit("error", err as Error);
    }

    this.seekTimeout.set(
      this.visibilityTimeoutSeconds * 2000,
      this.visibilityTimeoutSeconds * 4000,
    );
  }
}
