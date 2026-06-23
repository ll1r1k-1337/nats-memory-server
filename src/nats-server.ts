import child_process from 'child_process';
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

export class NatsServer {
  private process?: child_process.ChildProcessWithoutNullStreams;

  private host!: string;
  private port!: number;
  private monitorPort?: number;

  /** The options start() actually ran with, after merging in the defaults
   * and the project config; used by stop() so both ends of the lifecycle
   * observe the same `verbose`/`logger`. */
  private resolvedOptions?: NatsServerOptions;

  constructor(private readonly options: Partial<NatsServerOptions> = {}) {}

  async start(): Promise<this> {
    const projectConfig = await getProjectConfig(getProjectPath());

    const config: NatsServerOptions = {
      ...DEFAULT_NATS_SERVER_OPTIONS,
      ...pickRuntimeOptions(projectConfig),
      ...this.options,
    };
    this.resolvedOptions = config;

    const { verbose, logger } = config;

    if (this.process != null) {
      const message = `Nats server already started at ${this.getUrl()}`;

      if (verbose) {
        logger.warn(message);
      }

      return this;
    }

    const {
      args,
      ip,
      port = await getFreePort(),
      binPath,
      monitoring,
      startTimeoutMs,
    } = config;

    if (binPath == null) {
      throw new Error(`Could not resolve a binPath for the NATS server binary`);
    }

    // Resolve the monitoring port. `undefined` means monitoring is disabled; a
    // free port is allocated when monitoring is enabled without an explicit one.
    const monitorPort =
      monitoring === false
        ? undefined
        : typeof monitoring === `number`
        ? monitoring
        : await getFreePort();

    this.host = ip;
    this.port = port;
    this.monitorPort = monitorPort;

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

    return await new Promise((resolve, reject) => {
      const child = child_process.spawn(binPath, spawnArgs, { stdio: `pipe` });
      this.process = child;

      // Drain stdout so a child that writes heavily to stdout can't deadlock by
      // filling the OS pipe buffer while we wait for readiness.
      child.stdout.resume();

      let isReady = false;
      let settled = false;

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
        this.process = undefined;
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
        settleReject(
          new Error(
            `NATS server did not become ready within ${startTimeoutMs}ms`,
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
        const healthHost = ip === `0.0.0.0` ? `127.0.0.1` : ip;
        const healthUrl = `http://${healthHost}:${monitorPort}/healthz`;
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
        // Once ready, non-verbose mode has nothing left to do on this stream.
        if (isReady && !verbose) {
          return;
        }

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

        // Stderr is the readiness signal only when monitoring is disabled.
        if (monitorPort === undefined && !isReady) {
          const ready = Buffer.isBuffer(data)
            ? data.includes(`Server is ready`)
            : dataStr?.includes(`Server is ready`) === true;

          if (ready) {
            markReady();
          }
        }
      });

      child.once(`close`, (code) => {
        // The child has exited: clear the handle so a later stop() does not
        // kill() a dead process and so start() can spawn a fresh server later.
        this.process = undefined;
        clearTimeout(timer);
        controller.abort();

        if (verbose) {
          logger.log(`NATS server was stop!`);
        }

        // Exiting before readiness is always a failure regardless of exit code.
        if (!settled) {
          const message = `NATS server exited before becoming ready${
            code !== null ? ` (exit code: ${code})` : ``
          }`;

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
