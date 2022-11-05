import { Query } from "mingo";
import { RawObject } from "mingo/types";
import { Document, Filter } from "mongodb";
import { ErrorEvents } from "./ErrorEvents";
import { PromiseTracker } from "./PromiseTracker";
import { toError } from "./toError";
import { TypedEventEmitter } from "./TypedEventEmitter";

export interface SubscriptionOptions<TMessage extends Document> {
  /** Local filter to apply on received messages (in-memory). */
  filter?: Filter<TMessage>;
}

export type SubscriptionCallback<TMessage extends Document> = (
  message: TMessage
) => unknown;

export type SubscriptionEvents<TMessage extends Document> =
  ErrorEvents<TMessage>;

export class Subscription<TMessage extends Document> extends TypedEventEmitter<
  SubscriptionEvents<TMessage>
> {
  protected callback: SubscriptionCallback<TMessage>;
  protected filter?: Filter<TMessage>;
  protected mingoQuery?: Query;
  protected promises = new PromiseTracker();
  protected closed = false;

  constructor(
    callback: SubscriptionCallback<TMessage>,
    options: SubscriptionOptions<TMessage> = {}
  ) {
    super();

    this.callback = callback;
    this.filter = options.filter;

    if (this.filter) this.mingoQuery = new Query(this.filter);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    await this.promises.all();
  }

  async handle(message: TMessage) {
    if (this.closed) return;

    if (this.mingoQuery && !this.mingoQuery.test(message as RawObject)) {
      return;
    }

    try {
      await this.promises.run(async () => this.callback(message));
    } catch (err) {
      this.emit("error", toError(err), message);
    }
  }
}
