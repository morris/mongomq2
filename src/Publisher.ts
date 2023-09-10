import {
  Collection,
  Document,
  InsertOneOptions,
  MongoServerError,
  OptionalUnlessRequiredId,
} from "mongodb";
import { PromiseTracker } from "./PromiseTracker";
import { toError } from "./toError";

export interface PublisherOptions {
  insertOneOptions?: InsertOneOptions;
}

export class Publisher<TMessage extends Document> {
  protected collection: Collection<TMessage>;
  protected insertOneOptions: InsertOneOptions;
  protected promises = new PromiseTracker();
  protected closed = false;

  constructor(
    collection: Collection<TMessage>,
    options: PublisherOptions = {},
  ) {
    this.collection = collection;
    this.insertOneOptions = {
      writeConcern: { w: "majority" },
      ...options.insertOneOptions,
    };
  }

  async publish(message: OptionalUnlessRequiredId<TMessage>) {
    if (this.closed) throw new Error("Publisher closed");

    try {
      const result = await this.promises.add(
        this.collection.insertOne(message, this.insertOneOptions),
      );

      return result.insertedId;
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        return null;
      }

      throw toError(err);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
  }
}
