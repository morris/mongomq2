import EventEmitter from "events";
import {
  ChangeStream,
  ChangeStreamOptions,
  Collection,
  Filter,
  ObjectId,
} from "mongodb";
import { PromiseTracker } from "./PromiseTracker";
import {
  Subscription,
  SubscriptionCallback,
  SubscriptionOptions,
} from "./Subscription";

export interface SubscriberOptions<TMessage> {
  /** Global MongoDB filter to apply on change stream. */
  filter?: Filter<TMessage>;
  changeStreamOptions?: ChangeStreamOptions;
}

export class Subscriber<TMessage> extends EventEmitter {
  protected collection: Collection<TMessage>;
  protected filter: Filter<TMessage>;
  protected changeStreamOptions: ChangeStreamOptions;
  protected subscriptions = new Set<Subscription<TMessage>>();
  protected changeStream?: ChangeStream;
  protected promises = new PromiseTracker();
  protected closed = false;

  constructor(
    collection: Collection<TMessage>,
    options: SubscriberOptions<TMessage> = {}
  ) {
    super();

    this.collection = collection;
    this.filter = options.filter ?? {};
    this.changeStreamOptions = { ...options.changeStreamOptions };
  }

  /**
   * Subscribes to matching messages in the future.
   *
   * - All active subscribers will receive all future matching messages.
   * - Events are delivered at most once.
   * - Events are delivered in database insertion order.
   * - Past messages are ignored.
   * - Each `Subscriber` instance creates one MongoDB change stream.
   *  - Change streams occupy one connection,
   *  - so you'll usually want only one `Subscriber` instance,
   *  - and multiple `.subscribe()` calls with local filters.
   */
  subscribe<TSpecificEvent extends TMessage>(
    callback: SubscriptionCallback<TSpecificEvent>,
    options: SubscriptionOptions<TSpecificEvent> = {}
  ) {
    if (this.closed) throw new Error("Subscriber closed");

    this.init();

    const subscription = new Subscription(callback, options);
    subscription.on("error", (err) => this.emit("error", err));

    this.subscriptions.add(subscription as Subscription<TMessage>);

    return subscription;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    this.promises.run(async () => this.changeStream?.close());

    for (const subscription of this.subscriptions) {
      this.promises.add(subscription.close());
    }

    await this.promises.all();

    this.changeStream = undefined;
    this.subscriptions.clear();
  }

  protected init() {
    if (this.changeStream) return;

    type WatchResult<TMessage> = TMessage & {
      _oid?: ObjectId;
    };

    this.changeStream = this.collection.watch<WatchResult<TMessage>>(
      [
        { $match: { operationType: "insert" } },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: [
                "$fullDocument",
                { _id: "$_id", _oid: "$fullDocument._id" },
              ],
            },
          },
        },
        { $match: this.filter },
      ],
      this.changeStreamOptions
    );

    this.changeStream.on("change", async (change: WatchResult<TMessage>) => {
      if (this.closed) return;

      const message = { ...change, _id: change._oid };
      delete message._oid;

      for (const subscription of this.subscriptions) {
        subscription.handle(message);
      }
    });
  }
}
