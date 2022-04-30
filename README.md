# MongoMQ2

[![NPM version](https://img.shields.io/npm/v/mongomq2?style=flat-square)](https://www.npmjs.com/package/mongomq2)
[![Build status](https://img.shields.io/github/workflow/status/morris/mongomq2/Pipeline?style=flat-square)](https://github.com/morris/mongomq2/actions)
[![Coverage](https://img.shields.io/codecov/c/github/morris/mongomq2?style=flat-square&token=5GBOZPEJW0)](https://app.codecov.io/gh/morris/mongomq2)

MongoMQ2 is a light-weight Node.js library that turns MongoDB collections into
**general-purpose message queues** or event logs,
without additional server components.

At a slight expense of throughput compared to specialized
message queues and brokers like SQS, SNS, RabbitMQ or Kafka, you get:

- Persistent message/event logs in MongoDB collections.
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

There's more:

- Configurable number of retries
- Configurable visibility timeouts
- Configurable visibility delays
- Multiple isolated consumer groups on one queue
- Batch publishing of messages/events

MongoMQ2 can be an effective and flexible building block for
message- and event-driven architectures,
especially if you're already on MongoDB
and don't want to introduce additional system components.

## Installation

```sh
npm install mongomq2 mongodb
```

## Quick Start

```ts
import { MongoClient, ObjectId } from "mongodb";
import { Consumer, Publisher, Subscriber } from "mongomq2";

const mongoClient = new MongoClient("mongodb://localhost:27017");
await mongoClient.connect();

interface MyMessage {
  _id?: ObjectId;
  type: "hello" | "world";
}

const messagesCollection = mongoClient.db().collection<MyMessage>("messages");

// Subscribe to (future) messages of type "hello"
const subscriber = new Subscriber(messagesCollection);

subscriber.subscribe((message) => console.log("Received a hello!"), {
  filter: { type: "hello" },
});

// Consume messages (even past ones) of type "world"
const consumer = new Consumer(
  messagesCollection,
  (message) => console.log("Saved a world!"),
  { filter: { type: "world" } }
);

consumer.start();

// Publish some messages
const publisher = new Publisher(messagesCollection);

await publisher.publish({ type: "hello" });
await publisher.publish({ type: "world" });

// > Received a hello! (per active subscriber)
// > Saved a world! (consumed exactly once by one consumer)
```

## Synopsis

### Publisher

```ts
const publisher = new Publisher(collection);

await publisher.publish({ type: "hello" });
```

- Publishes the given message to the database immediately.
- Message insertion is acknowledged, or an error is thrown.

#### Use Cases

- Critical messages and events
- Job ingestion
- Commands

### BatchPublisher

```ts
const publisher = new BatchPublisher(collection);

publisher.publish({ type: "hello" });
```

- Queues the given message for publication in memory.
- Bulk inserts batched messages after a configurable delay.
- By default publishes messages with best effort (`majority` write concern, retries)
- Can be set to "fire & forget" mode by passing `bestEffort: false` (no write concern, no retries)

#### Use Cases

- Uncritical messages
- Uncritical notifications

### Subscriber

```ts
const subscriber = new Subscriber(collection, {
  filter: {
    /* optional global filter applied on change stream */
  },
});

subscriber.subscribe((message) => console.log(message), {
  filter: {
    /* optional local filter applied in memory */
  },
});
```

- Subscribes to matching messages in the future.
- All active subscribers will receive all future matching messages.
- Messages are delivered at most once.
- Messages are delivered in database insertion order.
- Past messages are ignored.
- Each `Subscriber` instance creates one MongoDB change stream.
  - Change streams occupy one connection,
  - so you'll usually want only exactly one `Subscriber` instance,
  - and multiple `.subscribe(...)` calls with local filters.

#### Use Cases

- Real-time notifications
- Cache invalidation

### Consumer

```ts
const consumer = new Consumer(collection, (message) => console.log(message), {
  // consumer group identifier, defaults to collection name
  group: "myConsumerGroup",
  filter: {
    /* optional filter */
  },
});

consumer.start();
```

- Consumes future and past matching messages.
- Order of message consumption is not guaranteed.
- Per `group`, each matching message is consumed by at most one consumer.
- Messages are consumed at-least-once per `group`.
  - Keep the `group` property stable per consumer.
  - Otherwise, messages will be reprocessed (once per unique `group`).
- Configurable visibility timeout, visibility delay, maximum number of retries, etc.

#### Use Cases

- Message queues
- Job queues
- Event processing
- Command processing

## Notes

- All MongoMQ2 clients are `EventEmitters`.
- Always attach `.on('error', (err) => /* report error */)` to monitor errors.
  - `err.mq2` will contain the message being processed, if any.
- Always `.close()` MongoMQ2 clients on shutdown (before closing the MongoClient).
  - MongoMQ2 will try to finish open tasks with best effort.
- MongoDB change streams are only supported for MongoDB replica sets.
  - To start a one-node replica set locally e.g. for testing, see `docker-compose.yml`.
