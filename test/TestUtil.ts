import { Collection, Db, Filter, MongoClient, ObjectId, WithId } from 'mongodb';
import assert from 'node:assert';
import { after, afterEach, before, beforeEach } from 'node:test';
import {
  BatchPublisher,
  BatchPublisherOptions,
  Consumer,
  ConsumerCallback,
  ConsumerOptions,
  Publisher,
  PublisherOptions,
  Subscriber,
  SubscriberOptions,
  WithOptionalObjectId,
} from '../src';

export type TestMessage = NumericTestMessage | TextTestMessage;

export interface NumericTestMessage extends WithOptionalObjectId {
  type: 'numeric';
  value: number;
  key?: string;
}

export interface TextTestMessage extends WithOptionalObjectId {
  type: 'text';
  value: string;
  key?: string;
}

export class TestFailure extends Error {}

export class TestUtil {
  public readonly mongoClient: MongoClient;
  public readonly db: Db;
  public readonly collection: Collection<TestMessage>;
  public readonly publishers: Publisher<TestMessage>[] = [];
  public readonly batchPublishers: BatchPublisher<TestMessage>[] = [];
  public readonly subscribers: Subscriber<TestMessage>[] = [];
  public readonly consumers: Consumer<TestMessage>[] = [];
  public readonly emittedErrors: Error[] = [];
  public readonly deadLetters: WithId<TestMessage>[] = [];

  constructor(env: Record<string, string | undefined>) {
    this.mongoClient = new MongoClient(
      env.MONGO_URL ?? 'mongodb://localhost:27017',
      { maxPoolSize: 100 },
    );

    this.db = this.mongoClient.db(env.DB_NAME ?? undefined);

    this.collection = this.db.collection(env.COLLECTION_NAME ?? 'messages');

    before(async () => {
      await this.mongoClient.connect();
    });

    beforeEach(async () => {
      for (const collection of await this.db.collections()) {
        await this.db.dropCollection(collection.collectionName);
      }
    });

    afterEach(async () => {
      const clients = [
        ...this.publishers,
        ...this.batchPublishers,
        ...this.subscribers,
        ...this.consumers,
      ];

      for (const client of clients) {
        await client.close();
      }

      this.publishers.length = 0;
      this.batchPublishers.length = 0;
      this.subscribers.length = 0;
      this.consumers.length = 0;
      this.emittedErrors.length = 0;
      this.deadLetters.length = 0;

      assert.deepStrictEqual(this.emittedErrors, []);
      assert.deepStrictEqual(this.deadLetters, []);
    });

    after(async () => {
      await this.mongoClient.close();
    });
  }

  createPublisher(options?: PublisherOptions) {
    const publisher = new Publisher(this.collection, options);

    this.publishers.push(publisher);

    return publisher;
  }

  createBatchPublisher(options?: BatchPublisherOptions) {
    const batchPublisher = new BatchPublisher(this.collection, options);

    batchPublisher.on('error', (err) => {
      if (err instanceof TestFailure) return;
      this.emittedErrors.push(err);
    });

    this.batchPublishers.push(batchPublisher);

    return batchPublisher;
  }

  createSubscriber(options?: SubscriberOptions<TestMessage>) {
    const subscriber = new Subscriber(this.collection, options);

    subscriber.on('error', (err) => {
      if (err instanceof TestFailure) return;
      this.emittedErrors.push(err);
    });

    this.subscribers.push(subscriber);

    return subscriber;
  }

  createConsumer<TMessage extends TestMessage>(
    callback: ConsumerCallback<TMessage>,
    options?: ConsumerOptions<TMessage>,
  ) {
    const consumer = new Consumer<TMessage>(
      this.collection as unknown as Collection<TMessage>,
      callback,
      options,
    );

    consumer.on('error', (err) => {
      if (err instanceof TestFailure) return;
      this.emittedErrors.push(err);
    });

    consumer.on('deadLetter', (err, message) => {
      if (err instanceof TestFailure) return;
      this.deadLetters.push(message as WithId<TestMessage>);
    });

    consumer.start();

    this.consumers.push(consumer as unknown as Consumer<TestMessage>);

    return consumer;
  }

  async waitUntilAcknowledged(filter: Filter<TestMessage>, group: string) {
    await this.waitUntil(async () => {
      const unacknowledgedCount = await this.collection.countDocuments({
        $and: [filter, { [`_c.${group}.a`]: { $exists: false } }],
      });

      return unacknowledgedCount === 0;
    });
  }

  async waitUntil(
    conditionFn: () => boolean | undefined | Promise<boolean | undefined>,
    interval = 100,
  ) {
    while (!(await conditionFn())) {
      await this.wait(interval);
    }
  }

  async wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  omitId<T extends { _id?: ObjectId }>(messages: T[]) {
    return messages.map((message) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id, ...rest } = message;

      return rest;
    });
  }
}
