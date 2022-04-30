export function toError<TMessage>(
  err: unknown,
  message?: TMessage
): Error & { mq2?: TMessage } {
  const err_ = err instanceof Error ? err : new Error(`Unknown error: ${err}`);

  if (message) Object.assign(err_, { mq2: message });

  return err_;
}
