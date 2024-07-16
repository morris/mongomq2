import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TestUtil } from './TestUtil';

describe('Publisher', () => {
  const testUtil = new TestUtil({ ...process.env, DB_NAME: 'Publisher' });

  it('publishes messages', async () => {
    const publisher = testUtil.createPublisher();

    await publisher.publish({ type: 'numeric', value: 1 });
    await publisher.publish({ type: 'text', value: 'hello' });

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1 },
      { type: 'text', value: 'hello' },
    ]);
  });

  it('publishes messages with unique keys once', async () => {
    await testUtil.collection.createIndex({ key: 1 }, { unique: true });

    const publisher = testUtil.createPublisher();

    await publisher.publish({ type: 'numeric', value: 1, key: '1' });
    await publisher.publish({ type: 'numeric', value: 2, key: '2' });
    await publisher.publish({ type: 'numeric', value: 1, key: '1' });
    await publisher.publish({ type: 'numeric', value: 3, key: '3' });

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(testUtil.omitId(messages), [
      { type: 'numeric', value: 1, key: '1' },
      { type: 'numeric', value: 2, key: '2' },
      { type: 'numeric', value: 3, key: '3' },
    ]);
  });

  it('throws if trying to publish after being closed', async () => {
    const publisher = testUtil.createPublisher();

    publisher.close();

    await assert.rejects(
      async () => publisher.publish({ type: 'numeric', value: 1 }),
      new Error('Publisher closed'),
    );

    const messages = await testUtil.collection.find({}).toArray();

    assert.deepStrictEqual(messages, []);
  });
});
