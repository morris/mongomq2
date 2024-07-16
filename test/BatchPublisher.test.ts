import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TestFailure, TestUtil } from './TestUtil';

describe('BatchPublisher', () => {
  const testUtil = new TestUtil({ ...process.env, DB_NAME: 'BatchPublisher' });

  it('publishes messages', async () => {
    const publisher = testUtil.createBatchPublisher({ batchDelayMs: 10 });

    publisher.publish({ type: 'numeric', value: 1 });
    publisher.publish({ type: 'text', value: 'hello' });

    await testUtil.wait(100);

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1 },
      { type: 'text', value: 'hello' },
    ]);
  });

  it('publishes messages with unique keys once', async () => {
    await testUtil.collection.createIndex({ key: 1 }, { unique: true });

    const publisher = testUtil.createBatchPublisher({ batchDelayMs: 10 });

    publisher.publish({ type: 'numeric', value: 1, key: '1' });
    publisher.publish({ type: 'numeric', value: 2, key: '2' });
    publisher.publish({ type: 'numeric', value: 1, key: '1' });
    publisher.publish({ type: 'numeric', value: 3, key: '3' });

    await testUtil.wait(100);

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1, key: '1' },
      { type: 'numeric', value: 2, key: '2' },
      { type: 'numeric', value: 3, key: '3' },
    ]);
  });

  it('publishes queued messages on close if bestEffort is enabled', async () => {
    const publisher = testUtil.createBatchPublisher({
      batchDelayMs: 10000,
      bestEffort: true,
    });

    publisher.publish({ type: 'numeric', value: 1 });
    publisher.publish({ type: 'text', value: 'hello' });

    await publisher.close();

    assert.throws(
      () => publisher.publish({ type: 'text', value: 'hello2' }),
      new Error('BatchPublisher closed'),
    );

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1 },
      { type: 'text', value: 'hello' },
    ]);
  });

  it('drops queued messages on close if bestEffort is disabled', async () => {
    const publisher = testUtil.createBatchPublisher({
      batchDelayMs: 10000,
      bestEffort: false,
    });

    publisher.publish({ type: 'numeric', value: 1 });
    publisher.publish({ type: 'text', value: 'hello' });

    await publisher.close();

    // should be ignored
    publisher.publish({ type: 'text', value: 'hello2' });

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), []);
  });

  it('publishes messages in batches respecting maxBatchSize', async () => {
    const publisher = testUtil.createBatchPublisher({
      batchDelayMs: 10,
      maxBatchSize: 2,
    });

    publisher.publish({ type: 'numeric', value: 1 });
    publisher.publish({ type: 'text', value: 'hello' });
    publisher.publish({ type: 'text', value: 'world' });

    await testUtil.wait(100);

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1 },
      { type: 'text', value: 'hello' },
      { type: 'text', value: 'world' },
    ]);
  });

  it('publishes messages in batches respecting maxBatchSize (queue size multiple of batch size)', async () => {
    const publisher = testUtil.createBatchPublisher({
      batchDelayMs: 10,
      maxBatchSize: 2,
    });

    publisher.publish({ type: 'numeric', value: 1 });
    publisher.publish({ type: 'text', value: 'hello' });
    publisher.publish({ type: 'text', value: 'world' });
    publisher.publish({ type: 'numeric', value: 2 });

    await testUtil.wait(100);

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1 },
      { type: 'text', value: 'hello' },
      { type: 'text', value: 'world' },
      { type: 'numeric', value: 2 },
    ]);
  });

  it('retries with best effort in case insertion failed', async (t) => {
    const publisher = testUtil.createBatchPublisher({
      batchDelayMs: 10,
      maxBatchSize: 2,
    });

    t.mock
      .method(testUtil.collection, 'insertMany')
      .mock.mockImplementationOnce(() => {
        throw new TestFailure('insertMany failed');
      });

    publisher.publish({ type: 'numeric', value: 1 });
    publisher.publish({ type: 'text', value: 'hello' });
    publisher.publish({ type: 'text', value: 'world' });
    publisher.publish({ type: 'numeric', value: 2 });

    await testUtil.wait(200);

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1 },
      { type: 'text', value: 'hello' },
      { type: 'text', value: 'world' },
      { type: 'numeric', value: 2 },
    ]);
  });
});
