import { ObjectId } from "mongodb";
import { TestFailure, TestMessage, TestUtil } from "./testUtil";

describe("A Subscriber", () => {
  const testUtil = new TestUtil(process.env);

  it("should be able to subscribe to messages", async () => {
    const publisher = testUtil.createPublisher();
    const subscriber = testUtil.createSubscriber();

    const numericMessages: TestMessage[] = [];
    const textMessages: TestMessage[] = [];

    subscriber.subscribe(
      (message) => {
        numericMessages.push(message);
      },
      {
        filter: { type: "numeric" },
      },
    );

    subscriber.subscribe(
      (message) => {
        textMessages.push(message);
      },
      {
        filter: { type: "text" },
      },
    );

    await testUtil.wait(100);

    await publisher.publish({ type: "numeric", value: 1 });
    await publisher.publish({ type: "numeric", value: 2 });
    await publisher.publish({ type: "text", value: "hello" });
    await publisher.publish({ type: "text", value: "world" });

    await testUtil.wait(100);

    expect(numericMessages).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1 },
      { _id: expect.any(ObjectId), type: "numeric", value: 2 },
    ]);

    expect(textMessages).toEqual([
      { _id: expect.any(ObjectId), type: "text", value: "hello" },
      { _id: expect.any(ObjectId), type: "text", value: "world" },
    ]);
  });

  it("should receive the same messages as an equivalent subscriber", async () => {
    const publisher = testUtil.createPublisher();

    const client1 = testUtil.createSubscriber();
    const client2 = testUtil.createSubscriber();

    const numericMessages1: TestMessage[] = [];
    const textMessages1: TestMessage[] = [];
    const numericMessages2: TestMessage[] = [];
    const textMessages2: TestMessage[] = [];

    client1.subscribe(
      (message) => {
        numericMessages1.push(message);
      },
      {
        filter: { type: "numeric" },
      },
    );

    client1.subscribe(
      (message) => {
        textMessages1.push(message);
      },
      {
        filter: { type: "text" },
      },
    );

    client2.subscribe(
      (message) => {
        numericMessages2.push(message);
      },
      {
        filter: { type: "numeric" },
      },
    );

    client2.subscribe(
      (message) => {
        textMessages2.push(message);
      },
      {
        filter: { type: "text" },
      },
    );

    await testUtil.wait(100);

    await publisher.publish({ type: "numeric", value: 1 });
    await publisher.publish({ type: "numeric", value: 2 });
    await publisher.publish({ type: "text", value: "hello" });
    await publisher.publish({ type: "text", value: "world" });

    await testUtil.wait(100);

    expect(numericMessages1).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1 },
      { _id: expect.any(ObjectId), type: "numeric", value: 2 },
    ]);

    expect(textMessages1).toEqual([
      { _id: expect.any(ObjectId), type: "text", value: "hello" },
      { _id: expect.any(ObjectId), type: "text", value: "world" },
    ]);

    expect(numericMessages1).toEqual(numericMessages2);
    expect(textMessages1).toEqual(textMessages2);
  });

  it("should emit error messages for failed callbacks", async () => {
    const publisher = testUtil.createPublisher();
    const subscriber = testUtil.createSubscriber();

    const subscriberErrors: Error[] = [];

    subscriber.on("error", (err) => subscriberErrors.push(err));

    const subscription = subscriber.subscribe((message) => {
      throw new TestFailure(`${message.value}`);
    });

    const subscriptionErrors: Error[] = [];

    subscription.on("error", (err) => subscriptionErrors.push(err));

    await testUtil.wait(100);

    await publisher.publish({ type: "numeric", value: 1 });
    await publisher.publish({ type: "numeric", value: 2 });
    await publisher.publish({ type: "text", value: "hello" });
    await publisher.publish({ type: "text", value: "world" });

    await testUtil.wait(100);

    expect(subscriberErrors.length).toEqual(4);
    expect(subscriberErrors).toEqual(subscriptionErrors);
  });
});
