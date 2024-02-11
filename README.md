# MongoMQ2

[![NPM version](https://img.shields.io/npm/v/mongomq2?style=flat-square)](https://www.npmjs.com/package/mongomq2)
[![Build status](https://img.shields.io/github/actions/workflow/status/morris/mongomq2/pipeline.yml?branch=main&style=flat-square)](https://github.com/morris/mongomq2/actions)
[![Coverage](https://img.shields.io/codecov/c/github/morris/mongomq2?style=flat-square&token=5GBOZPEJW0)](https://app.codecov.io/gh/morris/mongomq2)

MongoMQ2 is a light-weight Node.js library that turns MongoDB collections into
**general-purpose message queues** or event logs,
_without_ additional deployments or infrastructure.

At an expense of throughput compared to specialized
message queues and brokers like SQS, SNS, RabbitMQ or Kafka, you get:

- Durable message/event logs in MongoDB collections.
- Real-time, fan-out, at-most-once delivery to **subscribers**.
- Isolated, acknowledged, at-least-once delivery to **queue consumers**.
  - Effectively exactly-once if consumer workloads are idempotent.
- All the capabilities of regular MongoDB collections, e.g.
  - search indexes,
  - unique indexes for message/event deduplication,
  - aggregations,
  - capped collections,
  - sharding,
  - and TTL indexes.
- No chaining of queues required because subscribers and consumers can read from the same queue.
- Low-cost ops (no additional infrastructure besides a Node.js apps and MongoDB)

There's more:

- Configurable number of retries
- Configurable visibility timeouts
- Configurable visibility delays
- Multiple isolated consumer groups on one queue
- Batch publishing of messages/events

MongoMQ2 can be an effective and flexible building block for
message- and event-driven architectures,
especially if you're already on MongoDB
and don't want to introduce additional system components to deploy and operate.

## Installation

```sh
npm install mongomq2 mongodb
```

## Quick Start

```ts
import { MongoClient, ObjectId } from 'mongodb';
import { MessageQueue } from 'mongomq2';

const mongoClient = new MongoClient('mongodb://localhost:27017');

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
const messageCollection = mongoClient.db().collection<MyMessage>('messages');
const messageQueue = new MessageQueue(messageCollection);

// Consume "input" messages (including past ones)
// Publish one "output" message per "input" message
messageQueue.consume<InputMessage>(
  // consumer callback to be executed at least once per message
  async (message) => {
    console.log(`Processing ${message.data}...`);

    await messageQueue.publish({ type: 'output', result: message.data + '!' });
  },
  {
    group: 'handleInput', // group identifier, unique per consumer callback
    filter: { type: 'input' }, // only consume messages of type "input"
  },
);

// Subscribe to (future) "output" messages
messageQueue.subscribe<OutputMessage>(
  (message) => {
    console.log(`Processing done: ${message.result}`);
  },
  { filter: { type: 'output' } },
);

// Publish some messages
await messageQueue.publish({ type: 'input', data: 'hello' });
await messageQueue.publish({ type: 'input', data: 'world' });

// > Processing xxx... (processed exactly once)
// > Processing done: xxx! (per active subscriber)
```

## Usage

(See [API documentation](https://morris.github.io/mongomq2/)
for a detailed reference of all configuration and functionalities.)

### Setup

```ts
const messageCollection = mongoClient.db().collection<MyMessage>('messages');
const messageQueue = new MessageQueue(messageCollection);
```

### Publishing

```ts
await messageQueue.publish({ type: 'input' });
```

- Publishes the given message to the queue immediately.
- Message insertion is acknowledged, or an error is thrown.

Useful for:

- Critical messages and events
- Job ingestion
- Commands

### Batched Publishing

```ts
messageQueue.publishBatched({ type: 'input' });
```

- Queues the given message for publication in memory.
- Bulk inserts batched messages after a configurable delay.
- By default, publishes messages with best effort (`majority` write concern, retries)
- Can be set to "fire & forget" mode by passing `bestEffort: false` (no write concern, no retries)

Useful for:

- Uncritical messages
- Uncritical notifications

### Consumers

```ts
messageQueue.consume(
  (message) => {
    // handle message
  },
  {
    // consumer group identifier, defaults to collection name
    group: 'myConsumerGroup',
    filter: {
      // optional filter
    },
  },
);

messageQueue.on('deadLetter', (err, message, group) => {
  // handle dead letter, i.e. message that failed repeatedly and exhausted maxRetries
});
```

- Consumes future and past matching messages.
- Order of message consumption is not guaranteed.
- Per unique `group`, each matching message is consumed by at most one consumer.
- Messages are consumed at least once per `group`.
  - Keep the `group` property stable per consumer callback.
  - Otherwise, messages will be reprocessed (once per unique `group`).
- Configurable visibility timeout, visibility delay, maximum number of retries, etc.

Useful for:

- Message queues
- Job queues
- Event processing
- Command processing

### Subscriptions

```ts
messageQueue.subscribe(
  (message) => {
    // handle message
  },
  {
    filter: {
      // optional local filter applied in memory
    },
  },
);
```

- Subscribes to matching messages in the future.
- All active subscribers will receive all future matching messages.
- Messages are delivered at most once.
- Messages are delivered in database insertion order.
- Past messages are ignored.
- Each `MessageQueue` instance creates one MongoDB change stream.
  - Change streams occupy one connection,
  - so you'll usually want only exactly one `MessageQueue` instance,
  - and multiple `.subscribe(...)` calls with local filters.

Useful for:

- Real-time notifications
- Cache invalidation

### Additional Notes

- All MongoMQ2 clients are `EventEmitters`.
- Always attach `.on('error', (err, message?, group?) => /* report error */)` to monitor errors.
- Always `.close()` MongoMQ2 clients on shutdown (before closing the MongoClient).
  - MongoMQ2 will try to finish open tasks with best effort.
- MongoDB change streams are only supported for MongoDB replica sets.
  - To start a one-node replica set locally (e.g. for testing), see `docker-compose.yml`.
- MongoMQ2 relies on the `_id` index which always exists (no other indexes required)
- MongoMQ2 stores metadata for consumers in a `_c` field per message document (no other metadata is generated)

## Performance

For common workloads
(message size ~1 KB, produced and consumed in the same time frame),
MongoMQ2 should be able to handle **hundreds of messages
per second** in most environments; plenty for a variety of use cases.

As discussed earlier, MongoMQ2's trade-offs are

- less infrastructure,
- more flexibility,
- but therefore less specialization on queuing (e.g. performance/throughput).

Your mileage may vary.

---

Generally, MongoMQ2 is bound by the performance and latency
of the underlying MongoDB.

Publishing/producing messages in MongoMQ2 is bound by insertion time
on the message collection. Insertion time depends on message size
and number of indexes on the message collection.
As stated above, the simplest use cases only need the `_id` index.

Consumers are bound by MongoDB `findOneAndUpdate` performance, which will
usually perform an index scan (`IXSCAN`) on the `_id` index. This scan is mainly
bound by the number of messages currently being consumed, as consumers are
able to seek efficiently based on `_id` via time-based ordering.

Additionally, `findOneAndUpdate` performs some locking internally,
which may degrade for large numbers of concurrent producers/consumers.

See `test/benchmarks` for a benchmark suite
(as of yet, severely lacking - PRs welcome!).
