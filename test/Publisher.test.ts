import { ObjectId } from "mongodb";
import { TestUtil } from "./testUtil";

describe("A Publisher", () => {
  const util = new TestUtil(process.env);

  it("should be able to publish messages", async () => {
    const publisher = util.createPublisher();

    await publisher.publish({ type: "numeric", value: 1 });
    await publisher.publish({ type: "text", value: "hello" });

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1 },
      { _id: expect.any(ObjectId), type: "text", value: "hello" },
    ]);
  });

  it("should publish messages with unique keys once", async () => {
    await util.collection.createIndex({ key: 1 }, { unique: true });

    const publisher = util.createPublisher();

    await publisher.publish({ type: "numeric", value: 1, key: "1" });
    await publisher.publish({ type: "numeric", value: 2, key: "2" });
    await publisher.publish({ type: "numeric", value: 1, key: "1" });
    await publisher.publish({ type: "numeric", value: 3, key: "3" });

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1, key: "1" },
      { _id: expect.any(ObjectId), type: "numeric", value: 2, key: "2" },
      { _id: expect.any(ObjectId), type: "numeric", value: 3, key: "3" },
    ]);
  });

  it("should throw if trying to publish after being closed", async () => {
    const publisher = util.createPublisher();

    publisher.close();

    await expect(async () =>
      publisher.publish({ type: "numeric", value: 1 })
    ).rejects.toThrow("Publisher closed");

    const messages = await util.collection.find({}).toArray();

    expect(messages).toEqual([]);
  });
});
