import util from 'util';

/**
 * Runs one postinstall step (download/build) as the script's entrypoint and
 * turns a rejection into a loud, deterministic install failure.
 *
 * The failure path deliberately avoids `process.exit(1)` right after a
 * console call: process.exit() does not wait for pending asynchronous stdio
 * writes, and npm runs dependencies' lifecycle scripts with piped stdio by
 * default, so the diagnostic could be truncated exactly where it matters. Writing through the stream's
 * flush callback guarantees the message lands first; exiting inside the
 * callback (rather than relying on `process.exitCode` alone) still guarantees
 * termination even if a dependency left the event loop alive (e.g. keep-alive
 * sockets after a failed download).
 */
export function runInstallStep(
  step: () => Promise<void>,
  failureMessage: string,
): void {
  void step().catch((error: unknown) => {
    // util.inspect keeps non-Error rejections readable (String() would print
    // a plain object as "[object Object]").
    const message =
      error instanceof Error ? error.message : util.inspect(error);

    process.exitCode = 1;
    process.stderr.write(`${failureMessage}: ${message}\n`, () => {
      process.exit(1);
    });
  });
}
