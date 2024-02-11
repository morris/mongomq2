import type { Document, EventsDescription } from 'mongodb';

export interface ErrorEvents<TMessage extends Document>
  extends EventsDescription {
  error: (err: Error, message?: TMessage, group?: string) => void;
}
