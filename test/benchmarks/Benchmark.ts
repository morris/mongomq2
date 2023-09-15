import { MongoClient, MongoClientOptions, ObjectId } from "mongodb";
import { MessageQueue, MessageQueueOptions } from "../../src";

export interface BenchmarkMessage {
  _id?: ObjectId;
  data: string;
}

export interface BenchmarkOptions
  extends MessageQueueOptions<BenchmarkMessage> {
  url: string;
  mongoClientOptions?: MongoClientOptions;
  messageSize: number;
  publishDelayMs: number;
  numPastMessages: number;
  numMessages: number;
}

export class Benchmark {
  public preparedMessage: BenchmarkMessage;
  public publishTimes: [number, number][] = [];
  public consumeTimes: number[] = [];

  constructor(public options: BenchmarkOptions) {
    this.preparedMessage = { data: "0".repeat(this.options.messageSize) };
  }

  async setup() {
    const mongoClient = this.createMongoClient();
    const messageQueue = this.createMessageQueue(mongoClient);

    await messageQueue.collection.drop().catch(() => null);

    for (
      let pastMessagesInserted = 0;
      pastMessagesInserted < this.options.numPastMessages;

    ) {
      const bulk = messageQueue.collection.initializeOrderedBulkOp();
      const bulkSize = Math.min(
        this.options.numPastMessages - pastMessagesInserted,
        100,
      );

      for (let i = 0; i < bulkSize; ++i) {
        bulk.insert({ ...this.preparedMessage });
      }

      await bulk.execute();

      pastMessagesInserted += bulkSize;
    }

    await messageQueue.close();
    await mongoClient.close();
  }

  async run() {
    const mongoClient = this.createMongoClient();
    const messageQueue = this.createMessageQueue(mongoClient);

    messageQueue.consume<BenchmarkMessage>(async () => {
      this.consumeTimes.push(Date.now());
    });

    for (let i = 0; i < this.options.numMessages; ++i) {
      await this.publish(messageQueue, { ...this.preparedMessage });

      if (this.options.publishDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.options.publishDelayMs),
        );
      }
    }

    await messageQueue.drain(1000 * 60 * 60);

    await messageQueue.close();
    await mongoClient.close();
  }

  report() {
    return {
      publishAvgMs:
        this.publishTimes.reduce((sum, [t0, t1]) => sum + t1 - t0, 0) /
        this.publishTimes.length,
      totalConsumed: this.consumeTimes.length,
      consumedPerSecond:
        (this.consumeTimes.length /
          (this.consumeTimes[this.consumeTimes.length - 1] -
            this.consumeTimes[0])) *
        1000,
    };
  }

  async publish(
    messageQueue: MessageQueue<BenchmarkMessage>,
    message: BenchmarkMessage,
  ) {
    const t0 = Date.now();
    await messageQueue.publish(message);
    const t1 = Date.now();

    this.publishTimes.push([t0, t1]);
  }

  createMongoClient() {
    return new MongoClient(this.options.url, this.options.mongoClientOptions);
  }

  createMessageQueue(mongoClient: MongoClient, collectionName = "messages") {
    return new MessageQueue(
      mongoClient.db().collection<BenchmarkMessage>(collectionName),
      this.options,
    );
  }
}
