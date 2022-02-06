import { Collection, Filter, MongoClient, ObjectId } from "mongodb";
import { BatchPublisher, BatchPublisherOptions } from "../src/BatchPublisher";
import { Consumer, ConsumerCallback, ConsumerOptions } from "../src/Consumer";
import "../src/index";
import { Publisher, PublisherOptions } from "../src/Publisher";
import { Subscriber, SubscriberOptions } from "../src/Subscriber";

export type TestMessage = NumericTestMessage | TextTestMessage;

export interface NumericTestMessage {
  _id: ObjectId;
  type: "numeric";
  value: number;
  key?: string;
}

export interface TextTestMessage {
  _id: ObjectId;
  type: "text";
  value: string;
  key?: string;
}

export class TestFailure extends Error {}

export class TestUtil {
  public readonly mongoClient: MongoClient;
  public readonly collection: Collection<TestMessage>;
  public readonly publishers: Publisher<TestMessage>[] = [];
  public readonly batchPublishers: BatchPublisher<TestMessage>[] = [];
  public readonly subscribers: Subscriber<TestMessage>[] = [];
  public readonly consumers: Consumer<TestMessage>[] = [];
  public readonly emittedErrors: Error[] = [];

  constructor(env: Record<string, string | undefined>) {
    this.mongoClient = new MongoClient(
      env.MONGO_URL ?? "mongodb://localhost:27017",
      { maxPoolSize: 100 }
    );

    this.collection = this.mongoClient
      .db(env.DB_NAME ?? undefined)
      .collection(env.COLLECTION_NAME ?? "messages");

    beforeAll(async () => {
      await this.mongoClient.connect();
    });

    beforeEach(async () => {
      for (const collection of await this.mongoClient.db().collections()) {
        await this.mongoClient.db().dropCollection(collection.collectionName);
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

      // invariants
      try {
        expect(this.emittedErrors).toEqual([]);
      } finally {
        this.publishers.length = 0;
        this.batchPublishers.length = 0;
        this.subscribers.length = 0;
        this.consumers.length = 0;
        this.emittedErrors.length = 0;
      }
    });

    afterAll(async () => {
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

    batchPublisher.on("error", (err) => {
      if (err instanceof TestFailure) return;
      this.emittedErrors.push(err);
    });

    this.batchPublishers.push(batchPublisher);

    return batchPublisher;
  }

  createSubscriber(options?: SubscriberOptions<TestMessage>) {
    const subscriber = new Subscriber(this.collection, options);

    subscriber.on("error", (err) => {
      if (err instanceof TestFailure) return;
      this.emittedErrors.push(err);
    });

    this.subscribers.push(subscriber);

    return subscriber;
  }

  createConsumer<TEvent extends TestMessage>(
    callback: ConsumerCallback<TEvent>,
    options?: ConsumerOptions<TEvent>
  ) {
    const consumer = new Consumer(
      this.collection,
      callback as ConsumerCallback<TestMessage>,
      options as ConsumerOptions<TestMessage>
    );

    consumer.on("error", (err) => {
      if (err instanceof TestFailure) return;
      this.emittedErrors.push(err);
    });

    consumer.start();

    this.consumers.push(consumer);

    return consumer;
  }

  async wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitUntilAcknowledged(filter: Filter<TestMessage>, group: string) {
    while (true) {
      const unacknowledgedCount = await this.collection.count({
        $and: [filter, { [`_c.${group}.a`]: { $exists: false } }],
      });

      if (unacknowledgedCount === 0) return;

      await this.wait(100);
    }
  }
}
