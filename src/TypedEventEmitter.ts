import { TypedEventEmitter as ITypedEventEmitter } from 'mongodb';
import { EventEmitter } from 'stream';

// this rewiring is necessary because mongodb only declares the
// TypedEventEmitter class but exports no implementation

export let TypedEventEmitter = ITypedEventEmitter;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!TypedEventEmitter) TypedEventEmitter = EventEmitter as any;
