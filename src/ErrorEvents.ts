import { ErrorWithMessage } from "./ErrorWithMessage";

export interface ErrorEvents<TMessage> {
  error: (err: ErrorWithMessage<TMessage>) => unknown;
}
