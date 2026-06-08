import child_process from 'child_process';
import { getFreePort, getProjectConfig, getProjectPath } from './utils';
export interface Logger {
  log: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

export interface NatsServerOptions {
  verbose: boolean;
  args: string[];
  port?: number;
  ip: string;
  logger: Logger;
  binPath?: string;
}

export const DEFAULT_NATS_SERVER_OPTIONS = {
  verbose: true,
  // Bind to loopback by default so the ephemeral test broker is not exposed,
  // unauthenticated, on every network interface. Opt into a wider bind (e.g.
  // `0.0.0.0`) explicitly via setIp() when cross-host access is actually needed.
  ip: `127.0.0.1`,
  args: [],
  logger: console,
} satisfies NatsServerOptions;

export class NatsServer {
  private process?: child_process.ChildProcessWithoutNullStreams;

  private host!: string;
  private port!: number;

  constructor(private readonly options: NatsServerOptions) {}

  async start(): Promise<this> {
    const { verbose, logger } = this.options;

    if (this.process != null) {
      const message = `Nats server already started at ${this.getUrl()}`;

      if (verbose) {
        logger.warn(message);
      }

      return this;
    }

    // getProjectConfig memoizes per project path (and no longer caches a
    // rejection), so calling it directly each start() is both cheap and
    // recoverable — no separate static promise cache is needed here.
    const projectConfig = await getProjectConfig(getProjectPath());

    const config = { ...projectConfig, ...this.options };
    const { args, ip, port = await getFreePort(), binPath } = config;

    if (binPath == null) {
      throw new Error(`Could not resolve a binPath for the NATS server binary`);
    }

    return await new Promise((resolve, reject) => {
      this.process = child_process.spawn(
        binPath,
        [`--addr`, ip, `--port`, port.toString(), ...args],
        { stdio: `pipe` },
      );

      this.host = ip;
      this.port = port;

      let isReady = false;

      this.process.once(`error`, (err) => {
        if (verbose) {
          logger.error(`NATS server error:`, err);
        }

        // Only fail the start Promise if we never became ready; a transient
        // error after readiness must not tear down a running server's handle.
        if (!isReady) {
          this.process = undefined;
          reject(err);
        }
      });

      this.process.stderr.on(`data`, (data: unknown) => {
        // Once ready, non-verbose mode has nothing left to do on this stream,
        // so skip the work entirely for high-volume logs.
        if (isReady && !verbose) {
          return;
        }

        // Only allocate a string when we actually need it (verbose logging or
        // the readiness check on a non-Buffer chunk).
        let dataStr: string | undefined;
        if (Buffer.isBuffer(data)) {
          if (verbose) {
            dataStr = data.toString();
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          dataStr = data?.toString();
        }

        if (verbose && dataStr != null) {
          logger.log(dataStr);
        }

        if (!isReady) {
          const ready = Buffer.isBuffer(data)
            ? data.includes(`Server is ready`)
            : dataStr?.includes(`Server is ready`) === true;

          if (ready) {
            isReady = true;
            if (verbose) {
              logger.log(`NATS server is ready!`);
            }
            resolve(this);
            this.process?.unref();
          }
        }
      });

      this.process.once(`close`, (code) => {
        // The child has exited: clear the handle so a later stop() does not
        // kill() a dead process (which never re-emits `close`, hanging stop())
        // and so start() can spawn a fresh server on a subsequent call.
        this.process = undefined;

        if (verbose) {
          logger.log(`NATS server was stop!`);
        }

        // Exiting before the readiness signal is always a failure regardless of
        // the exit code (nats-server exits 0 on `--help`, 1 on a port conflict).
        // After readiness the start Promise is already settled, so this branch
        // is a no-op for the normal shutdown path.
        if (!isReady) {
          const message = `NATS server exited before becoming ready${
            code !== null ? ` (exit code: ${code})` : ``
          }`;

          if (verbose) {
            logger.warn(message, code);
          }

          reject(new Error(message));
        }
      });
    });
  }

  public getUrl(): string {
    return `nats://${this.host}:${this.port}`;
  }

  public getHost(): string {
    return this.host;
  }

  public getPort(): number {
    return this.port;
  }

  public async stop(): Promise<void> {
    const child = this.process;

    if (child == null) {
      return;
    }

    const { verbose, logger } = this.options;

    // The child has already exited (it crashed, or stop() was called before).
    // kill() would be a no-op that never emits `close`, so awaiting one here
    // would hang forever — just drop the dead handle and return.
    if (child.exitCode !== null || child.signalCode !== null) {
      this.process = undefined;
      return;
    }

    await new Promise<void>((resolve) => {
      child.once(`close`, (_code, _signal) => {
        this.process = undefined;

        if (verbose) {
          logger.log(`NATS server was stop at:`, this.getUrl());
        }

        resolve();
      });

      child.kill();
    });
  }
}
