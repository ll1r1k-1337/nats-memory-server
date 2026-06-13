import child_process from 'child_process';
import { getFreePort, getProjectConfig, getProjectPath } from './utils';
import { ensureBinary, type InstallLogger } from './utils/ensure-binary';
import { NatsServerStartError, NatsServerTimeoutError } from './errors';
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
  /**
   * Milliseconds to wait for the server to signal readiness before `start()`
   * gives up, kills the process, and rejects with a {@link NatsServerTimeoutError}.
   * `0` (or a negative value) disables the timeout. Note: this bounds only the
   * spawn-to-ready window, not a one-off lazy binary download.
   */
  startupTimeoutMs?: number;
}

export const DEFAULT_NATS_SERVER_OPTIONS = {
  verbose: true,
  // Bind to loopback by default so the ephemeral test broker is not exposed,
  // unauthenticated, on every network interface. Opt into a wider bind (e.g.
  // `0.0.0.0`) explicitly via setIp() when cross-host access is actually needed.
  ip: `127.0.0.1`,
  args: [],
  logger: console,
  startupTimeoutMs: 30_000,
} satisfies NatsServerOptions;

// Swallow install/download chatter when the server is not verbose.
const SILENT_INSTALL_LOGGER: InstallLogger = {
  log: () => undefined,
  warn: () => undefined,
};

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
    const {
      args,
      ip,
      port = await getFreePort(),
      startupTimeoutMs = DEFAULT_NATS_SERVER_OPTIONS.startupTimeoutMs,
    } = config;

    // Resolve the binary lazily: download (and optionally build) it on first
    // use if it is not already on disk. Only surface install chatter when the
    // server itself is verbose. Throws BinaryNotFoundError when it cannot be
    // resolved (no binPath, or download disabled and missing).
    const installLogger: InstallLogger = verbose
      ? logger
      : SILENT_INSTALL_LOGGER;
    const resolvedBinPath = await ensureBinary(config, installLogger);

    return await new Promise((resolve, reject) => {
      this.process = child_process.spawn(
        resolvedBinPath,
        [`--addr`, ip, `--port`, port.toString(), ...args],
        { stdio: `pipe` },
      );

      this.host = ip;
      this.port = port;

      let isReady = false;

      // Bound the spawn-to-ready window: a binary that never prints the
      // readiness line (a hang, a wrong/incompatible binary, a silent failure)
      // would otherwise leave start() pending forever. On fire we tear the
      // process down and reject; the timer is cleared in every settle path
      // below. unref() so a pending timer never keeps the event loop alive.
      let startupTimer: NodeJS.Timeout | undefined;
      const clearStartupTimer = (): void => {
        if (startupTimer !== undefined) {
          clearTimeout(startupTimer);
          startupTimer = undefined;
        }
      };

      if (startupTimeoutMs > 0) {
        startupTimer = setTimeout(() => {
          if (isReady) {
            return;
          }

          const message = `NATS server did not become ready within ${startupTimeoutMs}ms`;

          if (verbose) {
            logger.warn(message);
          }

          this.process?.kill();
          this.process = undefined;
          reject(new NatsServerTimeoutError(message, startupTimeoutMs));
        }, startupTimeoutMs);
        startupTimer.unref();
      }

      // Drain stdout so a child that writes heavily to stdout (e.g. `--log
      // /dev/stdout`) can't deadlock by filling the OS pipe buffer while we
      // wait for the readiness line on stderr. nats-server itself logs to
      // stderr, but we don't control what a custom binPath prints. We don't
      // need stdout's contents, so just let it flow and discard.
      this.process.stdout.resume();

      this.process.once(`error`, (err) => {
        if (verbose) {
          logger.error(`NATS server error:`, err);
        }

        // Only fail the start Promise if we never became ready; a transient
        // error after readiness must not tear down a running server's handle.
        if (!isReady) {
          clearStartupTimer();
          this.process = undefined;
          reject(
            new NatsServerStartError(
              `NATS server failed to start: ${err.message}`,
            ),
          );
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
            clearStartupTimer();
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
          clearStartupTimer();

          const message = `NATS server exited before becoming ready${
            code !== null ? ` (exit code: ${code})` : ``
          }`;

          if (verbose) {
            logger.warn(message, code);
          }

          reject(new NatsServerStartError(message, code));
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
