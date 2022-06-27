export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(`Unknown error: ${err}`);
}
