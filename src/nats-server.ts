import child_process from 'child_process';
import {
  getFreePort,
  getProjectConfig,
  getProjectPath,
  type NatsMemoryServerConfig,
} from './utils';
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

/**
 * Extract the runtime options a project config file may provide. Only keys
 * actually present in the config are returned, so an absent key never
 * shadows a built-in default when spread.
 */
function pickRuntimeOptions(
  config: NatsMemoryServerConfig,
): Partial<NatsServerOptions> {
  const runtime: Partial<NatsServerOptions> = {};

  if (config.verbose !== undefined) {
    runtime.verbose = config.verbose;
  }
  if (config.ip !== undefined) {
    runtime.ip = config.ip;
  }
  if (config.port !== undefined) {
    runtime.port = config.port;
  }
  if (config.args !== undefined) {
    runtime.args = config.args;
  }
  if (config.binPath !== undefined) {
    runtime.binPath = config.binPath;
  }

  return runtime;
}

export class NatsServer {
  private process?: child_process.ChildProcessWithoutNullStreams;

  private host!: string;
  private port!: number;

  /** The options start() actually ran with, after merging in the defaults
   * and the project config; used by stop() so both ends of the lifecycle
   * observe the same `verbose`/`logger`. */
  private resolvedOptions?: NatsServerOptions;

  /** The in-flight start() promise. Established synchronously at the top of
   * start() so concurrent/re-entrant calls share one spawn instead of racing
   * past the `this.process == null` guard — this.process is not assigned until
   * spawnServer() spawns, after its awaits. */
  private startPromise?: Promise<this>;

  constructor(private readonly options: Partial<NatsServerOptions> = {}) {}

  async start(): Promise<this> {
    // Already running: a previous start() resolved and set this.process. Read
    // verbose/logger from the options that start actually ran with.
    if (this.process != null) {
      const { verbose, logger } = this.resolvedOptions ?? {
        ...DEFAULT_NATS_SERVER_OPTIONS,
        ...this.options,
      };
      const message = `Nats server already started at ${this.getUrl()}`;

      if (verbose) {
        logger.warn(message);
      }

      return this;
    }

    // A start() is already in flight (e.g. Promise.all([s.start(), s.start()])
    // or a re-entrant call before the first resolved). Share that promise: the
    // guard above can't catch a concurrent caller because this.process is not
    // assigned until spawnServer() spawns — after its awaits — so without this
    // a second caller would spawn a second, orphaned child.
    if (this.startPromise != null) {
      return await this.startPromise;
    }

    const startPromise = this.spawnServer();
    this.startPromise = startPromise;

    try {
      return await startPromise;
    } finally {
      // Clear so a later start() (after stop() or a crash) can spawn afresh.
      this.startPromise = undefined;
    }
  }

  private async spawnServer(): Promise<this> {
    // getProjectConfig memoizes per project path (and no longer caches a
    // rejection), so calling it directly each start() is both cheap and
    // recoverable — no separate static promise cache is needed here.
    const projectConfig = await getProjectConfig(getProjectPath());

    // Precedence: built-in defaults < project config file < options passed
    // explicitly to the builder/constructor. Plain spreads keep an
    // explicitly-set `undefined` overriding the config (e.g. a deliberate
    // `{ binPath: undefined }` must not silently fall back).
    const config: NatsServerOptions = {
      ...DEFAULT_NATS_SERVER_OPTIONS,
      ...pickRuntimeOptions(projectConfig),
      ...this.options,
    };
    this.resolvedOptions = config;

    const { verbose, logger } = config;
    const { args, ip, port = await getFreePort(), binPath } = config;

    if (binPath == null) {
      throw new Error(`Could not resolve a binPath for the NATS server binary`);
    }

    return await new Promise<this>((resolve, reject) => {
      const child = child_process.spawn(
        binPath,
        [`--addr`, ip, `--port`, port.toString(), ...args],
        { stdio: `pipe` },
      );

      this.process = child;
      this.host = ip;
      this.port = port;

      // Drain stdout so a child that writes heavily to stdout (e.g. `--log
      // /dev/stdout`) can't deadlock by filling the OS pipe buffer while we
      // wait for the readiness line on stderr. nats-server itself logs to
      // stderr, but we don't control what a custom binPath prints. We don't
      // need stdout's contents, so just let it flow and discard.
      child.stdout.resume();

      let isReady = false;

      child.once(`error`, (err) => {
        if (verbose) {
          logger.error(`NATS server error:`, err);
        }

        // Only fail the start Promise if we never became ready; a transient
        // error after readiness must not tear down a running server's handle.
        // Clear the handle only if it still points at our child, so a failed
        // spawn cannot wipe a handle a later start() already installed.
        if (!isReady) {
          if (this.process === child) {
            this.process = undefined;
          }
          reject(err);
        }
      });

      child.stderr.on(`data`, (data: unknown) => {
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
            child.unref();
          }
        }
      });

      child.once(`close`, (code) => {
        // The child has exited: clear the handle so a later stop() does not
        // kill() a dead process (which never re-emits `close`, hanging stop())
        // and so start() can spawn a fresh server on a subsequent call. Guard
        // on identity so a second, failed spawn's close can't clear the handle
        // of a healthy server a later start() already installed.
        if (this.process === child) {
          this.process = undefined;
        }

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

    // start() assigns resolvedOptions before it ever spawns the child, so it
    // is always defined when a child handle exists; the fallback merge is
    // purely type-level defensiveness.
    const { verbose, logger } = this.resolvedOptions ?? {
      ...DEFAULT_NATS_SERVER_OPTIONS,
      ...this.options,
    };

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
