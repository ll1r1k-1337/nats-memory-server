import util from 'util';

export interface RunInstallStepOptions {
  /**
   * When `true` (the default) a failure is reported as a warning and the
   * process still exits 0, so a flaky download or an offline/`--ignore-scripts`
   * install never hard-fails the consumer's `npm install`; the binary is then
   * fetched lazily on the first `start()`. Setting the
   * `NATS_MEMORY_SERVER_STRICT_INSTALL=1` environment variable (or passing
   * `optional: false`) restores the legacy hard failure.
   */
  optional?: boolean;
}

/**
 * Runs one postinstall step (download/build) as the script's entrypoint.
 *
 * The failure path deliberately avoids `process.exit(1)` right after a console
 * call: process.exit() does not wait for pending asynchronous stdio writes, and
 * npm runs dependencies' lifecycle scripts with piped stdio by default, so the
 * diagnostic could be truncated exactly where it matters. Writing through the
 * stream's flush callback guarantees the message lands first; exiting inside the
 * callback (rather than relying on `process.exitCode` alone) still guarantees
 * termination even if a dependency left the event loop alive (e.g. keep-alive
 * sockets after a failed download).
 */
export function runInstallStep(
  step: () => Promise<void>,
  failureMessage: string,
  options: RunInstallStepOptions = {},
): void {
  const optional = options.optional ?? true;
  const strict =
    !optional || process.env.NATS_MEMORY_SERVER_STRICT_INSTALL === `1`;

  void step().catch((error: unknown) => {
    // util.inspect keeps non-Error rejections readable (String() would print
    // a plain object as "[object Object]").
    const message =
      error instanceof Error ? error.message : util.inspect(error);

    if (strict) {
      process.exitCode = 1;
      process.stderr.write(`${failureMessage}: ${message}\n`, () => {
        process.exit(1);
      });
      return;
    }

    // Soft mode: warn and keep the install green. The binary is downloaded on
    // demand the first time the server is started.
    process.stderr.write(
      `${failureMessage}: ${message}\n` +
        `Continuing install; the NATS server binary will be downloaded on first use. ` +
        `Set NATS_MEMORY_SERVER_STRICT_INSTALL=1 to fail the install instead.\n`,
    );
  });
}
