import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TestFailure, TestMessage, TestUtil } from './TestUtil';

describe('Subscriber', () => {
  const testUtil = new TestUtil({ ...process.env, DB_NAME: 'Subscriber' });

  it('subscribes to messages', async () => {
    const publisher = testUtil.createPublisher();
    const subscriber = testUtil.createSubscriber();

    const numericMessages: TestMessage[] = [];
    const textMessages: TestMessage[] = [];

    subscriber.subscribe(
      (message) => {
        numericMessages.push(message);
      },
      {
        filter: { type: 'numeric' },
      },
    );

    subscriber.subscribe(
      (message) => {
        textMessages.push(message);
      },
      {
        filter: { type: 'text' },
      },
    );

    await testUtil.wait(100);

    await publisher.publish({ type: 'numeric', value: 1 });
    await publisher.publish({ type: 'numeric', value: 2 });
    await publisher.publish({ type: 'text', value: 'hello' });
    await publisher.publish({ type: 'text', value: 'world' });

    await testUtil.wait(100);

    assert.deepStrictEqual(testUtil.omitId(numericMessages), [
      { type: 'numeric', value: 1 },
      { type: 'numeric', value: 2 },
    ]);

    assert.deepStrictEqual(testUtil.omitId(textMessages), [
      { type: 'text', value: 'hello' },
      { type: 'text', value: 'world' },
    ]);
  });

  it('receives the same messages as an equivalent subscriber', async () => {
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
        filter: { type: 'numeric' },
      },
    );

    client1.subscribe(
      (message) => {
        textMessages1.push(message);
      },
      {
        filter: { type: 'text' },
      },
    );

    client2.subscribe(
      (message) => {
        numericMessages2.push(message);
      },
      {
        filter: { type: 'numeric' },
      },
    );

    client2.subscribe(
      (message) => {
        textMessages2.push(message);
      },
      {
        filter: { type: 'text' },
      },
    );

    await testUtil.wait(100);

    await publisher.publish({ type: 'numeric', value: 1 });
    await publisher.publish({ type: 'numeric', value: 2 });
    await publisher.publish({ type: 'text', value: 'hello' });
    await publisher.publish({ type: 'text', value: 'world' });

    await testUtil.wait(100);

    assert.deepStrictEqual(testUtil.omitId(numericMessages1), [
      { type: 'numeric', value: 1 },
      { type: 'numeric', value: 2 },
    ]);

    assert.deepStrictEqual(testUtil.omitId(textMessages1), [
      { type: 'text', value: 'hello' },
      { type: 'text', value: 'world' },
    ]);

    assert.deepStrictEqual(numericMessages1, numericMessages2);
    assert.deepStrictEqual(textMessages1, textMessages2);
  });

  it('emits error messages for failed callbacks', async () => {
    const publisher = testUtil.createPublisher();
    const subscriber = testUtil.createSubscriber();

    const subscriberErrors: Error[] = [];

    subscriber.on('error', (err) => subscriberErrors.push(err));

    const subscription = subscriber.subscribe((message) => {
      throw new TestFailure(`${message.value}`);
    });

    const subscriptionErrors: Error[] = [];

    subscription.on('error', (err) => subscriptionErrors.push(err));

    await testUtil.wait(100);

    await publisher.publish({ type: 'numeric', value: 1 });
    await publisher.publish({ type: 'numeric', value: 2 });
    await publisher.publish({ type: 'text', value: 'hello' });
    await publisher.publish({ type: 'text', value: 'world' });

    await testUtil.wait(100);

    assert.deepStrictEqual(subscriberErrors.length, 4);
    assert.deepStrictEqual(subscriberErrors, subscriptionErrors);
  });
});
