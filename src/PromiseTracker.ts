export class PromiseTracker {
  protected promises = new Set<Promise<unknown>>();

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.add(fn());
  }

  add<T>(promise: Promise<T>): Promise<T> {
    const trackedPromise: Promise<unknown> = promise.then(
      () => this.promises.delete(trackedPromise),
      () => this.promises.delete(trackedPromise),
    );

    this.promises.add(trackedPromise);

    return promise;
  }

  async all() {
    while (this.promises.size > 0) {
      await Promise.all(Array.from(this.promises));
    }
  }
}
