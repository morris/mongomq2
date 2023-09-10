export class Timeout {
  protected callback: () => unknown;
  protected id?: NodeJS.Timeout;

  constructor(callback: () => unknown) {
    this.callback = callback;
  }

  set(minDelayMs: number, maxDelayMs = minDelayMs) {
    if (this.id) clearTimeout(this.id);

    this.id = setTimeout(
      () => {
        this.id = undefined;
        this.callback();
      },
      minDelayMs + Math.floor((maxDelayMs - minDelayMs) * Math.random()),
    );
  }

  isSet() {
    return !!this.id;
  }

  clear() {
    if (this.id) clearTimeout(this.id);

    this.id = undefined;
  }
}
