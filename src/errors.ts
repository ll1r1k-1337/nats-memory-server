/**
 * Base class for every error thrown by nats-memory-server. Catch this to handle
 * any failure originating from the library; catch a subclass to discriminate
 * between the specific causes below.
 */
export class NatsMemoryServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = `NatsMemoryServerError`;
    // Restore the prototype chain so `instanceof` keeps working after
    // TypeScript downlevels to ES2016, where extending the built-in Error
    // otherwise severs it. `new.target` is the concrete subclass being
    // constructed, so doing this once in the base covers every subclass.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * The NATS server binary could not be located and could not be obtained
 * automatically — either `download` is disabled, or no `binPath` could be
 * resolved at all.
 */
export class BinaryNotFoundError extends NatsMemoryServerError {
  constructor(message: string, public readonly binPath?: string) {
    super(message);
    this.name = `BinaryNotFoundError`;
  }
}

/**
 * The downloaded archive's SHA-256 digest did not match the digest published in
 * the release's SHA256SUMS — the download is corrupt or has been tampered with.
 */
export class ChecksumMismatchError extends NatsMemoryServerError {
  constructor(
    message: string,
    public readonly assetName: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(message);
    this.name = `ChecksumMismatchError`;
  }
}

/**
 * The NATS server process exited or emitted an error before it signalled
 * readiness, so `start()` could not bring up a usable server.
 */
export class NatsServerStartError extends NatsMemoryServerError {
  constructor(
    message: string,
    public readonly code?: number | null,
    public readonly signal?: NodeJS.Signals | null,
  ) {
    super(message);
    this.name = `NatsServerStartError`;
  }
}

/**
 * The NATS server did not signal readiness within `startupTimeoutMs`, so
 * `start()` gave up and terminated the (possibly hung) process.
 */
export class NatsServerTimeoutError extends NatsMemoryServerError {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = `NatsServerTimeoutError`;
  }
}
