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
  ip: `0.0.0.0`,
  args: [],
  logger: console,
} satisfies NatsServerOptions;

export class NatsServer {
  private static projectConfigPromise?: Promise<NatsMemoryServerConfig>;
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

    if (NatsServer.projectConfigPromise === undefined) {
      const projectPath = getProjectPath();
      NatsServer.projectConfigPromise = getProjectConfig(projectPath);
    }

    const projectConfig = await NatsServer.projectConfigPromise;

    const config = { ...projectConfig, ...this.options };
    const { args, ip, port = await getFreePort(), binPath } = config;

    return await new Promise((resolve, reject) => {
      this.process = child_process.spawn(
        binPath,
        [`--addr`, ip, `--port`, port.toString(), ...args],
        { stdio: `pipe` },
      );

      this.host = ip;
      this.port = port;

      this.process.once(`error`, (err) => {
        if (verbose) {
          logger.error(`NATS server error:`, err);
        }

        reject(err);
      });

      let isReady = false;
      this.process.stderr.on(`data`, (data: unknown) => {
        // ⚡ Bolt: Fast-path early return for high-volume logs after readiness
        if (isReady && !verbose) {
          return;
        }

        let dataStr: string | undefined;

        if (verbose || !isReady) {
          if (Buffer.isBuffer(data)) {
            if (!isReady && data.includes(`Server is ready`)) {
              isReady = true;
            }
            if (verbose) {
              dataStr = data.toString();
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            dataStr = data?.toString();
            if (!isReady && dataStr?.includes(`Server is ready`) === true) {
              isReady = true;
            }
          }
        }

        if (verbose && dataStr != null) {
          logger.log(dataStr);
        }

        if (isReady) {
          if (verbose) {
            logger.log(`NATS server is ready!`);
          }
          resolve(this);
          this.process?.unref();
        }
      });

      this.process.on(`close`, (code) => {
        if (verbose) {
          logger.log(`NATS server was stop!`);
        }

        if (code === 0 || code === 1) {
          resolve(this);
        } else {
          const message = `Process was killed ${
            code !== null ? `with exit code: ${code}` : ``
          } `;

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
    if (this.process == null) {
      return;
    }

    const { verbose, logger } = this.options;

    await new Promise<void>((resolve) => {
      this.process?.on(`close`, (_code, _signal) => {
        if (verbose) {
          logger.log(`NATS server was stop at:`, this.getUrl());
        }

        this.process = undefined;
        resolve();
      });

      this.process?.kill();
    });
  }
}
