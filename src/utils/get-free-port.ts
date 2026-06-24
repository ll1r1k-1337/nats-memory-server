import net from 'net';

/** Binds an ephemeral port, reads it, releases it, and returns the number. */
async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once(`error`, reject);
    srv.listen(0, () => {
      const address = srv.address();
      const port =
        address !== null && typeof address === `object` ? address.port : 0;
      srv.close(() => {
        if (port === 0) {
          reject(new Error(`Failed to acquire a free port`));
        } else {
          resolve(port);
        }
      });
    });
  });
}

/**
 * Resolves a TCP port that is free right now. Pass `exclude` to avoid specific
 * ports: getFreePort releases each probe socket before returning, so two
 * back-to-back calls can otherwise hand back the same number — excluding an
 * already-chosen port keeps, e.g., a monitoring port from colliding with the
 * client port (`--port X -m X` would fail to bind).
 */
export async function getFreePort(
  exclude: ReadonlySet<number> = new Set(),
): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await allocatePort();
    if (!exclude.has(port)) {
      return port;
    }
  }

  throw new Error(`Could not find a free port outside the excluded set`);
}
