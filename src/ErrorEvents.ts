import { EventsDescription } from "mongodb";

export interface ErrorEvents<TMessage> extends EventsDescription {
  error: (err: Error, message?: TMessage) => unknown;
}
