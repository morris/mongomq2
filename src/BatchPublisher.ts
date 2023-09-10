import {
  BulkWriteOptions,
  Collection,
  Document,
  MongoBulkWriteError,
  OptionalUnlessRequiredId,
} from "mongodb";
import { ErrorEvents } from "./ErrorEvents";
import { Timeout } from "./Timeout";
import { toError } from "./toError";
import { TypedEventEmitter } from "./TypedEventEmitter";

export interface BatchPublisherOptions {
  /**
   * Maximum number of messages per batch to bulk insert.
   */
  maxBatchSize?: number;

  /**
   * Delay before a batch insert.
   */
  batchDelayMs?: number;

  /**
   * With `bestEffort: true` (default),
   *
   * - batches are inserted with write concern `majority`,
   * - the `BatchPublisher` will emit `error` events on write failures,
   * - retry inserting messages,
   * - and attempt a bulk insert on closure.
   *
   * With `bestEffort: false`,
   *
   * - batches are inserted with write concern `0`,
   * - no errors will be emitted on failures,
   * - and unwritten messages will be dropped in case of failure or closure.
   */
  bestEffort?: boolean;

  bulkWriteOptions?: BulkWriteOptions;
}

export type BatchPublisherEvents<TMessage extends Document> =
  ErrorEvents<TMessage>;

export class BatchPublisher<
  TMessage extends Document,
> extends TypedEventEmitter<BatchPublisherEvents<TMessage>> {
  protected collection: Collection<TMessage>;
  protected maxBatchSize: number;
  protected delayMs: number;
  protected bestEffort: boolean;
  protected bulkWriteOptions: BulkWriteOptions;
  protected queue: OptionalUnlessRequiredId<TMessage>[] = [];
  protected flushTimeout = new Timeout(() => this.flush());
  protected closed = false;

  constructor(
    collection: Collection<TMessage>,
    options: BatchPublisherOptions = {},
  ) {
    super();

    this.collection = collection;
    this.maxBatchSize = options.maxBatchSize ?? 100;
    this.delayMs = options.batchDelayMs ?? 100;
    this.bestEffort = options.bestEffort ?? true;
    this.bulkWriteOptions = {
      ordered: false,
      writeConcern: { w: this.bestEffort ? "majority" : 0 },
      ...options.bulkWriteOptions,
    };
  }

  /**
   * Publish a message after a delay.
   * See `options.bestEffort` for behavior.
   */
  publish(message: OptionalUnlessRequiredId<TMessage>) {
    if (this.closed) {
      if (!this.bestEffort) return;

      throw new Error("BatchPublisher closed");
    }

    this.queue.push(message);

    if (!this.flushTimeout.isSet()) {
      this.flushTimeout.set(this.delayMs);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    this.flushTimeout.clear();

    if (this.bestEffort) await this.flush();

    this.queue = [];
  }

  protected async flush() {
    try {
      if (this.queue.length === 0) return;

      do {
        if (this.closed && !this.bestEffort) return;

        const batch = this.queue.slice(0, this.maxBatchSize);
        this.queue = this.queue.slice(batch.length);

        try {
          await this.collection.insertMany(batch, this.bulkWriteOptions);
        } catch (err) {
          if (!(err instanceof MongoBulkWriteError && err.code === 11000)) {
            if (this.bestEffort) {
              this.queue = [...this.queue, ...batch];
            }

            throw err;
          }
        }
      } while (this.queue.length >= this.maxBatchSize);
    } catch (err) {
      this.emit("error", toError(err));
      this.flushTimeout.set(this.delayMs);
    }
  }
}
