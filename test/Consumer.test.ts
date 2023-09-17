import { ObjectId } from "mongodb";
import { Publisher } from "../src";
import {
  NumericTestMessage,
  TestFailure,
  TestMessage,
  TestUtil,
  TextTestMessage,
} from "./testUtil";

describe("A Consumer", () => {
  const util = new TestUtil(process.env);

  it("should be able to publish and consume messages (2 consumers, 4 messages)", async () => {
    const publisher = new Publisher(util.collection);

    const numericMessages1: NumericTestMessage[] = [];
    const textMessages1: TextTestMessage[] = [];
    const numericMessages2: NumericTestMessage[] = [];
    const textMessages2: TextTestMessage[] = [];

    util.createConsumer<NumericTestMessage>(
      (message) => {
        numericMessages1.push(message);
      },
      {
        filter: { type: "numeric" },
        group: "numeric",
      },
    );

    util.createConsumer<TextTestMessage>(
      (message) => {
        textMessages1.push(message);
      },
      {
        filter: { type: "text" },
        group: "text",
      },
    );

    util.createConsumer<NumericTestMessage>(
      (message) => {
        numericMessages2.push(message);
      },
      {
        filter: { type: "numeric" },
        group: "numeric",
      },
    );

    util.createConsumer<TextTestMessage>(
      (message) => {
        textMessages2.push(message);
      },
      {
        filter: { type: "text" },
        group: "text",
      },
    );

    await publisher.publish({ type: "numeric", value: 1 });
    await publisher.publish({ type: "numeric", value: 2 });
    await publisher.publish({ type: "text", value: "hello" });
    await publisher.publish({ type: "text", value: "world" });

    await util.waitUntilAcknowledged({ type: "numeric" }, "numeric");
    await util.waitUntilAcknowledged({ type: "text" }, "text");

    expect(
      [...numericMessages1, ...numericMessages2].sort(
        (a, b) => a.value - b.value,
      ),
    ).toEqual([
      { _id: expect.any(ObjectId), type: "numeric", value: 1 },
      { _id: expect.any(ObjectId), type: "numeric", value: 2 },
    ]);

    expect(
      [...textMessages1, ...textMessages2].sort((a, b) =>
        a.value < b.value ? -1 : a.value > b.value ? 1 : 0,
      ),
    ).toEqual([
      { _id: expect.any(ObjectId), type: "text", value: "hello" },
      { _id: expect.any(ObjectId), type: "text", value: "world" },
    ]);
  });

  describe("(randomized)", () => {
    interface TestRandomizedOptions {
      numberOfConsumers: number;
      numberOfNumericMessages: number;
      numberOfTextMessages: number;
      failureRate?: number;
      concurrency?: number;
    }

    function testRandomized(options: TestRandomizedOptions) {
      const {
        numberOfConsumers: numberOfConsumers,
        numberOfNumericMessages,
        numberOfTextMessages,
        failureRate = 0,
        concurrency = 1,
      } = options;

      const optionsForLabel = JSON.stringify(options, null, 2);

      it(`should be able to publish and consume messages; ${optionsForLabel}`, async () => {
        const publisher = new Publisher(util.collection);

        const numericMessages: NumericTestMessage[] = [];
        const textMessages: TextTestMessage[] = [];

        for (let i = 0; i < numberOfConsumers; ++i) {
          util.createConsumer<NumericTestMessage>(
            (message) => {
              if (Math.random() < failureRate / 2) {
                throw new TestFailure("Failure before workload");
              }

              numericMessages.push(message);

              if (Math.random() < failureRate / 2) {
                throw new TestFailure("Failure after workload");
              }
            },
            {
              group: "numeric",
              filter: { type: "numeric" },
              concurrency,
              visibilityTimeoutSeconds: 1,
              maxRetries: 100,
            },
          );

          util.createConsumer<TextTestMessage>(
            (message) => {
              if (Math.random() < failureRate / 2) {
                throw new TestFailure("Failure before workload");
              }

              textMessages.push(message);

              if (Math.random() < failureRate / 2) {
                throw new TestFailure("Failure after workload");
              }
            },
            {
              group: "text",
              filter: { type: "text" },
              concurrency,
              visibilityTimeoutSeconds: 1,
              maxRetries: 100,
            },
          );
        }

        const p1 = (async () => {
          for (let i = 0; i < numberOfNumericMessages; ++i) {
            await publisher.publish({ type: "numeric", value: i });
          }
        })();

        const p2 = (async () => {
          for (let i = 0; i < numberOfTextMessages; ++i) {
            await publisher.publish({
              type: "text",
              value: "t" + i,
            });
          }
        })();

        await Promise.all([p1, p2]);

        await util.waitUntilAcknowledged({ type: "numeric" }, "numeric");
        await util.waitUntilAcknowledged({ type: "text" }, "text");

        if (failureRate > 0) {
          expect(
            numericMessages.length >= numberOfNumericMessages,
          ).toBeTruthy();

          expect(textMessages.length >= numberOfTextMessages).toBeTruthy();
        } else {
          expect(numericMessages.length).toEqual(numberOfNumericMessages);
          expect(textMessages.length).toEqual(numberOfTextMessages);
        }

        const numericValues = new Set(numericMessages.map((it) => it.value));
        const textValues = new Set(textMessages.map((it) => it.value));

        expect(numericValues.size).toEqual(numberOfNumericMessages);
        expect(textValues.size).toEqual(numberOfTextMessages);
      }, 15000);
    }

    testRandomized({
      numberOfConsumers: 1,
      numberOfNumericMessages: 100,
      numberOfTextMessages: 100,
      failureRate: 0,
    });

    testRandomized({
      numberOfConsumers: 4,
      numberOfNumericMessages: 100,
      numberOfTextMessages: 100,
      failureRate: 0,
    });

    testRandomized({
      numberOfConsumers: 1,
      numberOfNumericMessages: 900,
      numberOfTextMessages: 100,
      failureRate: 0.1,
      concurrency: 5,
    });

    testRandomized({
      numberOfConsumers: 5,
      numberOfNumericMessages: 100,
      numberOfTextMessages: 900,
      failureRate: 0.2,
      concurrency: 5,
    });
  });

  it("should consume past messages correctly", async () => {
    const now = Math.floor(Date.now() / 1000);
    const group = "testGroup";

    const messages = [
      {
        _id: ObjectId.createFromTime(now - 120),
        type: "text",
        value: "too old",
      },
      {
        _id: ObjectId.createFromTime(now - 35),
        type: "text",
        value: "should be consumed 1",
      },
      {
        _id: ObjectId.createFromTime(now - 30),
        type: "text",
        value: "acknowledged",
        _c: {
          [group]: {
            v: (now - 25) * 1000,
            a: (now - 23) * 1000,
          },
        },
      },
      {
        _id: ObjectId.createFromTime(now - 25),
        type: "text",
        value: "should be consumed 2",
        _c: {
          [group]: {
            v: (now - 20) * 1000,
            r: 1,
          },
        },
      },
      {
        _id: ObjectId.createFromTime(now - 15),
        type: "text",
        value: "too many retries",
        _c: {
          [group]: {
            v: (now - 10) * 1000,
            r: 3,
          },
        },
      },
      {
        _id: ObjectId.createFromTime(now - 20),
        type: "text",
        value: "should be consumed 3",
      },
      {
        _id: ObjectId.createFromTime(now - 5),
        type: "text",
        value: "too new",
      },
    ] as TextTestMessage[];

    await util.collection.insertMany(messages);

    const consumed: TextTestMessage[] = [];

    util.createConsumer<TextTestMessage>(
      (message) => {
        consumed.push(message);
      },
      {
        group,
        visibilityDelaySeconds: 10,
        visibilityTimeoutSeconds: 2,
        maxVisibilitySeconds: 60,
        maxRetries: 2,
      },
    );

    util.createConsumer<TextTestMessage>(
      (message) => {
        consumed.push(message);
      },
      {
        group,
        visibilityDelaySeconds: 10,
        visibilityTimeoutSeconds: 2,
        maxVisibilitySeconds: 60,
        maxRetries: 2,
      },
    );

    await util.waitUntilAcknowledged({ _id: messages[5]._id }, group);

    expect(consumed).toMatchObject([
      { value: "should be consumed 1" },
      { value: "should be consumed 2" },
      { value: "should be consumed 3" },
    ]);
  });

  it("should emit deadLetter events when retries are exhausted", async () => {
    const group = "testGroup";
    const consumed: TestMessage[] = [];
    let errors = 0;
    const deadLetters: TestMessage[] = [];

    const consumer = util.createConsumer(
      (message) => {
        if (message.value === "fail") {
          throw new TestFailure("always fails");
        }

        consumed.push(message);
      },
      {
        group,
        maxRetries: 3,
        pollMs: 10,
        fastPollMs: 10,
        visibilityTimeoutSeconds: 1,
      },
    );

    consumer.on("error", () => ++errors);

    consumer.on("deadLetter", (err, message) => {
      deadLetters.push(message);
    });

    const publisher = util.createPublisher();

    await publisher.publish({
      type: "text",
      value: "ok1",
    });

    await publisher.publish({
      type: "text",
      value: "ok2",
    });

    await publisher.publish({
      type: "text",
      value: "fail",
    });

    await publisher.publish({
      type: "text",
      value: "ok3",
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(consumed).toMatchObject([
      { value: "ok1" },
      { value: "ok2" },
      { value: "ok3" },
    ]);

    expect(errors).toBe(4); // 1 initial try + 3 retries
    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0]).toMatchObject({ value: "fail" });
  }, 300000);
});
