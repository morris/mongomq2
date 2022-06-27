import { ObjectId } from "mongodb";
import { TestUtil } from "./testUtil";

describe("A BatchPublisher", () => {
  const util = new TestUtil(process.env);

  it("should be able to publish messages", async () => {
    const publisher = util.createBatchPublisher({ batchDelayMs: 10 });

    publisher.publish({ type: "numeric", value: 1 });
    publisher.publish({ type: "text", value: "hello" });

    await util.wait(100);

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1 },
      { _id: expect.any(ObjectId), type: "text", value: "hello" },
    ]);
  });

  it("should publish messages with unique keys once", async () => {
    await util.collection.createIndex({ key: 1 }, { unique: true });

    const publisher = util.createBatchPublisher({ batchDelayMs: 10 });

    publisher.publish({ type: "numeric", value: 1, key: "1" });
    publisher.publish({ type: "numeric", value: 2, key: "2" });
    publisher.publish({ type: "numeric", value: 1, key: "1" });
    publisher.publish({ type: "numeric", value: 3, key: "3" });

    await util.wait(100);

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1, key: "1" },
      { _id: expect.any(ObjectId), type: "numeric", value: 2, key: "2" },
      { _id: expect.any(ObjectId), type: "numeric", value: 3, key: "3" },
    ]);
  });

  it("should publish queued messages on close if bestEffort is enabled", async () => {
    const publisher = util.createBatchPublisher({
      batchDelayMs: 10000,
      bestEffort: true,
    });

    publisher.publish({ type: "numeric", value: 1 });
    publisher.publish({ type: "text", value: "hello" });

    await publisher.close();

    expect(() =>
      publisher.publish({ type: "text", value: "hello2" })
    ).toThrowError("BatchPublisher closed");

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1 },
      { _id: expect.any(ObjectId), type: "text", value: "hello" },
    ]);
  });

  it("should drop queued messages on close if bestEffort is disabled", async () => {
    const publisher = util.createBatchPublisher({
      batchDelayMs: 10000,
      bestEffort: false,
    });

    publisher.publish({ type: "numeric", value: 1 });
    publisher.publish({ type: "text", value: "hello" });

    await publisher.close();

    // should be ignored
    publisher.publish({ type: "text", value: "hello2" });

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([]);
  });
});
