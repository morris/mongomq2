import { ObjectId } from "mongodb";
import { Consumer, Publisher, Subscriber } from "../src";
import { TestUtil } from "./testUtil";

describe("The examples from the README", () => {
  const util = new TestUtil(process.env);

  it("should work", async () => {
    const logs: string[] = [];

    function log(message: string) {
      logs.push(message);
    }

    const mongoClient = util.mongoClient;

    interface MyMessage {
      _id?: ObjectId;
      type: "hello" | "world";
    }

    const messagesCollection = mongoClient
      .db()
      .collection<MyMessage>("messages");

    // Subscribe to (future) messages of type "hello"
    const subscriber = new Subscriber(messagesCollection);

    subscriber.subscribe((message) => log(`Received a ${message.type}!`), {
      filter: { type: "hello" },
    });

    // Consume messages (even past ones) of type "world"
    const consumer = new Consumer(
      messagesCollection,
      (message) => log(`Saved a ${message.type}!`),
      { filter: { type: "world" } }
    );

    consumer.start();

    // Publish some messages
    const publisher = new Publisher(messagesCollection);

    await publisher.publish({ type: "hello" });
    await publisher.publish({ type: "world" });

    // > Received a hello! (per active subscriber)
    // > Saved a world! (consumed exactly once by one consumer)

    await util.wait(2000);
    await subscriber.close();
    await consumer.close();

    expect(logs).toEqual(["Received a hello!", "Saved a world!"]);
  });
});
