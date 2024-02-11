import {
  Collection,
  Document,
  InsertOneOptions,
  MongoServerError,
  OptionalUnlessRequiredId,
} from 'mongodb';

export interface PublisherOptions {
  insertOneOptions?: InsertOneOptions;
}

export class Publisher<TMessage extends Document> {
  protected collection: Collection<TMessage>;
  protected insertOneOptions: InsertOneOptions;
  protected closed = false;

  constructor(
    collection: Collection<TMessage>,
    options: PublisherOptions = {},
  ) {
    this.collection = collection;
    this.insertOneOptions = {
      writeConcern: { w: 'majority' },
      ...options.insertOneOptions,
    };
  }

  /**
   * Publishes the given message, returning the inserted message ID.
   * Ignores message duplicates, returning null in that case.
   * Can be used inside transactions (same options as MongoDB `insertOne`).
   */
  async publish(
    message: OptionalUnlessRequiredId<TMessage>,
    options?: InsertOneOptions,
  ) {
    if (this.closed) throw new Error('Publisher closed');

    try {
      const result = await this.collection.insertOne(message, {
        ...this.insertOneOptions,
        ...options,
      });

      return result.insertedId;
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        return null;
      }

      throw err;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
  }
}
