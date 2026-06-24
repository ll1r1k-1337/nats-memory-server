import child_process from 'child_process';
import { StringDecoder } from 'string_decoder';
import {
  getFreePort,
  getProjectConfig,
  getProjectPath,
  waitForHealthz,
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
  /** HTTP monitoring port: `false` disables it, `true` picks a free port, a number uses that port. */
  monitoring: boolean | number;
  /** How long start() waits for readiness before failing, in milliseconds. */
  startTimeoutMs: number;
}

export const DEFAULT_NATS_SERVER_OPTIONS = {
  verbose: true,
  // Bind to loopback by default so the ephemeral test broker is not exposed,
  // unauthenticated, on every network interface. Opt into a wider bind (e.g.
  // `0.0.0.0`) explicitly via setIp() when cross-host access is actually needed.
  ip: `127.0.0.1`,
  args: [],
  logger: console,
  monitoring: false,
  startTimeoutMs: 30000,
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
  if (config.monitoring !== undefined) {
    runtime.monitoring = config.monitoring;
  }
  if (config.startTimeoutMs !== undefined) {
    runtime.startTimeoutMs = config.startTimeoutMs;
  }

  return runtime;
}

/**
 * Builds the local `/healthz` probe URL for a server bound to `ip`. Wildcard
 * binds are probed over loopback (`0.0.0.0` -> `127.0.0.1`, `::` -> `::1`), and
 * IPv6 literals are wrapped in brackets so the URL is well-formed — otherwise
 * `http.get` throws `ERR_INVALID_URL` and readiness can only fail by timeout.
 */
export function buildHealthzUrl(ip: string, monitorPort: number): string {
  let host: string;
  if (ip === `0.0.0.0` || ip === ``) {
    host = `127.0.0.1`;
  } else if (ip === `::` || ip === `[::]`) {
    host = `::1`;
  } else {
    host = ip;
  }

  // An IPv6 literal (contains `:`) must be bracketed in a URL authority.
  const authorityHost =
    host.includes(`:`) && !host.startsWith(`[`) ? `[${host}]` : host;

  return `http://${authorityHost}:${monitorPort}/healthz`;
}

export class NatsServer {
  private process?: child_process.ChildProcessWithoutNullStreams;

  private host!: string;
  private port!: number;
  private monitorPort?: number;

  /** The options start() actually ran with, after merging in the defaults
   * and the project config; used by stop() so both ends of the lifecycle
   * observe the same `verbose`/`logger`. */
  private resolvedOptions?: NatsServerOptions;

  /** The in-flight start() promise. Established synchronously at the top of
   * start() so concurrent/re-entrant calls share one spawn instead of racing
   * past the `this.process == null` guard — this.process is not assigned until
   * _start() spawns, after its awaits. */
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
    // assigned until _start() spawns — after its awaits — so without this
    // a second caller would spawn a second, orphaned child.
    if (this.startPromise != null) {
      return await this.startPromise;
    }

    const startPromise = this._start();
    this.startPromise = startPromise;

    try {
      return await startPromise;
    } finally {
      // Clear so a later start() (after stop() or a crash) can spawn afresh.
      this.startPromise = undefined;
    }
  }

  private async _start(): Promise<this> {
    // getProjectConfig memoizes per project path (and no longer caches a
    // rejection), so calling it directly each start() is both cheap and
    // recoverable — no separate static promise cache is needed here.
    const projectConfig = await getProjectConfig(getProjectPath());

    const config: NatsServerOptions = {
      ...DEFAULT_NATS_SERVER_OPTIONS,
      ...pickRuntimeOptions(projectConfig),
      ...this.options,
    };
    this.resolvedOptions = config;

    const { verbose, logger } = config;
    const { args, ip, binPath, monitoring, startTimeoutMs } = config;

    if (binPath == null) {
      throw new Error(`Could not resolve a binPath for the NATS server binary`);
    }

    // Resolve the client and monitoring ports so they can never collide.
    // getFreePort releases each probe socket before returning, so two unguarded
    // calls — or an auto port that happens to equal an explicit one — could
    // yield the same number, and `--port X -m X` fails to bind. Exclude the
    // explicit monitoring port when auto-allocating the client port, and the
    // resolved client port when auto-allocating the monitoring port.
    const explicitMonitorPort =
      typeof monitoring === `number` ? monitoring : undefined;

    const port =
      config.port ??
      (await getFreePort(
        explicitMonitorPort !== undefined
          ? new Set([explicitMonitorPort])
          : undefined,
      ));

    // `undefined` means monitoring is disabled; a free port (distinct from the
    // client port) is allocated when monitoring is enabled without an explicit
    // one.
    const monitorPort =
      monitoring === false
        ? undefined
        : explicitMonitorPort ?? (await getFreePort(new Set([port])));

    if (monitorPort !== undefined && monitorPort === port) {
      throw new Error(
        `NATS client port and monitoring port must differ (both ${port})`,
      );
    }

    this.host = ip;
    this.port = port;
    this.monitorPort = undefined;

    const spawnArgs =
      monitorPort !== undefined
        ? [
            `--addr`,
            ip,
            `--port`,
            port.toString(),
            `-m`,
            monitorPort.toString(),
            ...args,
          ]
        : [`--addr`, ip, `--port`, port.toString(), ...args];

    return await new Promise<this>((resolve, reject) => {
      const child = child_process.spawn(binPath, spawnArgs, { stdio: `pipe` });
      this.process = child;

      // Drain stdout so a child that writes heavily to stdout can't deadlock by
      // filling the OS pipe buffer while we wait for readiness.
      child.stdout.resume();

      let isReady = false;
      let settled = false;
      let stderrTail = ``;
      const MAX_STDERR_TAIL = 2000;
      // Decode stderr across chunk boundaries so a multibyte UTF-8 sequence
      // split between two `data` events is not corrupted in the captured tail.
      const stderrDecoder = new StringDecoder(`utf8`);

      // A single controller + timer bounds the whole readiness wait and stops
      // the healthz poller. Cleared/aborted in every settlement path so nothing
      // outlives start().
      const controller = new AbortController();

      const settleReject = (error: Error): void => {
        clearTimeout(timer);
        controller.abort();
        if (settled) {
          return;
        }
        settled = true;
        // Clear the handle only if it still points at our child, so a stale
        // settle (e.g. a failed earlier spawn) can't wipe a healthy handle a
        // later start() installed.
        if (this.process === child) {
          this.process = undefined;
        }
        reject(error);
      };

      const markReady = (): void => {
        if (settled) {
          return;
        }
        isReady = true;
        settled = true;
        clearTimeout(timer);
        controller.abort();
        if (verbose) {
          logger.log(`NATS server is ready!`);
        }
        this.monitorPort = monitorPort;
        resolve(this);
        child.unref();
      };

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        // Kill the child we could not confirm ready, then fail loudly.
        child.kill();
        if (verbose) {
          logger.warn(
            `NATS server did not become ready within ${startTimeoutMs}ms`,
          );
        }
        const tail = stderrTail.trim();
        settleReject(
          new Error(
            `NATS server did not become ready within ${startTimeoutMs}ms` +
              (tail !== `` ? `. Last stderr: ${tail}` : ``),
          ),
        );
      }, startTimeoutMs);
      timer.unref();

      child.once(`error`, (err) => {
        if (verbose) {
          logger.error(`NATS server error:`, err);
        }
        // After readiness, settleReject() is a no-op (settled) and leaves the
        // running handle intact — a transient post-ready error must not tear it
        // down. Before readiness it rejects the start Promise.
        settleReject(err);
      });

      // When monitoring is enabled, readiness is decided by the HTTP monitoring
      // endpoint — deterministic and independent of log text.
      if (monitorPort !== undefined) {
        const healthUrl = buildHealthzUrl(ip, monitorPort);
        void waitForHealthz(healthUrl, { signal: controller.signal })
          .then(() => {
            markReady();
          })
          .catch(() => {
            // Aborted by the timeout/error/close path, which has already
            // settled the Promise; nothing to do here.
          });
      }

      child.stderr.on(`data`, (data: unknown) => {
        // Once settled, non-verbose mode has nothing left to do on this stream.
        if (settled && !verbose) {
          return;
        }

        let dataStr: string | undefined;
        if (Buffer.isBuffer(data)) {
          dataStr = stderrDecoder.write(data);
        } else if (data != null) {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          dataStr = String(data);
        }

        // Keep a short rolling tail of stderr before readiness so a failed
        // start can report what nats-server actually printed.
        if (!settled && dataStr != null && dataStr !== ``) {
          stderrTail = (stderrTail + dataStr).slice(-MAX_STDERR_TAIL);
        }

        if (verbose && dataStr != null) {
          logger.log(dataStr);
        }

        // Stderr is the readiness signal only when monitoring is disabled.
        if (monitorPort === undefined && !isReady && dataStr != null) {
          if (dataStr.includes(`Server is ready`)) {
            markReady();
          }
        }
      });

      child.once(`close`, (code) => {
        // kill() a dead process (which never re-emits `close`, hanging stop())
        // and so start() can spawn a fresh server later. Guard on identity so a
        // second, failed spawn's close can't clear a healthy handle a later
        // start() installed.
        if (this.process === child) {
          this.process = undefined;
        }
        clearTimeout(timer);
        controller.abort();

        if (verbose) {
          logger.log(`NATS server was stop!`);
        }

        // Exiting before readiness is always a failure regardless of exit code.
        if (!settled) {
          const tail = stderrTail.trim();
          const message = `NATS server exited before becoming ready${
            code !== null ? ` (exit code: ${code})` : ``
          }${tail !== `` ? `. Last stderr: ${tail}` : ``}`;

          if (verbose) {
            logger.warn(message, code);
          }

          settleReject(new Error(message));
        }
      });
    });
  }

  public getUrl(): string {
    return `nats://${this.host}:${this.port}`;
  }

  public getMonitoringUrl(): string | undefined {
    if (this.monitorPort === undefined) {
      return undefined;
    }
    return `http://${this.host}:${this.monitorPort}`;
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
