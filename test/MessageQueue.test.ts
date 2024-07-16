import { ObjectId } from 'mongodb';
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { MessageQueue } from '../src';
import { TestUtil } from './TestUtil';

describe('MessageQueue', () => {
  const testUtil = new TestUtil({ ...process.env, DB_NAME: 'MessageQueue' });

  it('correctly runs the example in the README', async () => {
    const logs: string[] = [];

    function log(message: string) {
      logs.push(message);
    }

    const db = testUtil.db;

    type MyMessage = InputMessage | OutputMessage;

    interface InputMessage {
      _id?: ObjectId;
      type: 'input';
      data: string;
    }

    interface OutputMessage {
      _id?: ObjectId;
      type: 'output';
      result: string;
    }

    // create MessageQueue
    const queue = new MessageQueue<MyMessage>(
      db.collection<MyMessage>('messages'),
    );

    // Consume "input" messages (including past ones)
    // Publish one "output" message per "input" message
    queue.consume<InputMessage>(
      async (message) => {
        log(`Processing ${message.data}...`);

        await queue.publish({ type: 'output', result: message.data + '!' });
      },
      {
        filter: { type: 'input' },
        group: 'HANDLE_UPLOAD', // globally unique group
      },
    );

    // Subscribe to (future) "output" messages
    queue.subscribe<OutputMessage>(
      (message) => log(`Processing done: ${message.result}`),
      { filter: { type: 'output' } },
    );

    // Publish some messages
    await queue.publish({ type: 'input', data: 'hello' });
    await queue.publish({ type: 'input', data: 'world' });

    // > Processing xxx... (processed exactly once)
    // > Processing done: xxx! (per active subscriber)

    await queue.drain();
    await queue.close();

    assert.deepStrictEqual(logs.sort(), [
      'Processing done: hello!',
      'Processing done: world!',
      'Processing hello...',
      'Processing world...',
    ]);
  });

  it('filters correctly using global and local filters', async () => {
    const logs: string[] = [];

    interface MyMessage {
      _id?: ObjectId;
      type: 'a' | 'b';
      category: 'c' | 'd';
    }

    function log(message: MyMessage) {
      logs.push(message.type + message.category);
    }

    const queue = new MessageQueue<MyMessage>(
      testUtil.db.collection<MyMessage>('messages'),
      { filter: { type: 'a' } },
    );

    queue.consume(log, { group: '1' });
    queue.consume(log, { group: '2', filter: { category: 'c' } });
    queue.consume(log, { group: '3', filter: { category: 'd' } });
    queue.consume(log, { group: '4', filter: { type: 'b' } });

    await queue.publish({ type: 'a', category: 'c' });
    await queue.publish({ type: 'a', category: 'd' });
    await queue.publish({ type: 'b', category: 'c' });
    await queue.publish({ type: 'b', category: 'd' });

    await queue.drain();
    await queue.close();

    assert.deepStrictEqual(logs.sort(), ['ac', 'ac', 'ad', 'ad']);
  });
});
