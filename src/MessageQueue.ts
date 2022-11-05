import { Collection, Filter, OptionalUnlessRequiredId } from "mongodb";
import {
  BatchPublisher,
  BatchPublisherEvents,
  BatchPublisherOptions,
} from "./BatchPublisher";
import {
  Consumer,
  ConsumerCallback,
  ConsumerEvents,
  ConsumerOptions,
} from "./Consumer";
import { Publisher, PublisherOptions } from "./Publisher";
import { Subscriber, SubscriberEvents, SubscriberOptions } from "./Subscriber";
import { SubscriptionCallback, SubscriptionOptions } from "./Subscription";
import { TypedEventEmitter } from "./TypedEventEmitter";
import { WithOptionalObjectId } from "./WithOptionalObjectId";

export interface MessageQueueOptions<TMessage extends WithOptionalObjectId>
  extends PublisherOptions,
    BatchPublisherOptions,
    SubscriberOptions<TMessage>,
    ConsumerOptions<TMessage> {}

export interface MessageQueueEvents<TMessage extends WithOptionalObjectId>
  extends BatchPublisherEvents<TMessage>,
    SubscriberEvents<TMessage>,
    ConsumerEvents<TMessage> {}

export class MessageQueue<
  TMessage extends WithOptionalObjectId
> extends TypedEventEmitter<MessageQueueEvents<TMessage>> {
  public readonly collection: Collection<TMessage>;
  protected options: MessageQueueOptions<TMessage>;
  protected publisher: Publisher<TMessage>;
  protected batchPublisher: BatchPublisher<TMessage>;
  protected subscriber: Subscriber<TMessage>;
  protected consumers: Consumer<TMessage>[] = [];

  constructor(
    collection: Collection<TMessage>,
    options?: MessageQueueOptions<TMessage>
  ) {
    super();

    this.collection = collection;
    this.options = options ?? {};
    this.publisher = new Publisher(collection, options);
    this.batchPublisher = new BatchPublisher(collection, options);
    this.subscriber = new Subscriber(collection, options);

    this.batchPublisher.on("error", (err, message) =>
      this.emit("error", err, message)
    );

    this.subscriber.on("error", (err, message) =>
      this.emit("error", err, message)
    );
  }

  publish(message: OptionalUnlessRequiredId<TMessage>) {
    return this.publisher.publish(message);
  }

  publishBatched(message: OptionalUnlessRequiredId<TMessage>) {
    return this.batchPublisher.publish(message);
  }

  subscribe<TSpecificMessage extends TMessage>(
    callback: SubscriptionCallback<TSpecificMessage>,
    options?: SubscriptionOptions<TSpecificMessage>
  ) {
    return this.subscriber.subscribe(callback, options);
  }

  consume<TSpecificMessage extends TMessage>(
    callback: ConsumerCallback<TSpecificMessage>,
    options?: ConsumerOptions<TSpecificMessage>
  ) {
    const { filter: globalFilter, ...globalOptions } = this.options;
    const { filter: localFilter, ...localOptions } = options ?? {};

    const filter =
      globalFilter && localFilter
        ? { $and: [globalFilter, localFilter] }
        : globalFilter ?? localFilter;

    const consumer = new Consumer(
      this.collection as unknown as Collection<TSpecificMessage>,
      callback,
      {
        ...globalOptions,
        ...localOptions,
        filter: filter as Filter<TSpecificMessage>,
      }
    );

    consumer.on("error", (err, message) => this.emit("error", err, message));
    consumer.on("drained", () => this.emit("drained"));

    this.consumers.push(consumer as unknown as Consumer<TMessage>);

    consumer.start();

    return consumer;
  }

  async drain(timeoutMs?: number) {
    await Promise.all(
      this.consumers.map((consumer) => consumer.drain(timeoutMs))
    );
  }

  async close() {
    await Promise.all([
      this.publisher.close(),
      this.batchPublisher.close(),
      this.subscriber.close(),
      ...this.consumers.map((consumer) => consumer.close()),
    ]);
  }
}
