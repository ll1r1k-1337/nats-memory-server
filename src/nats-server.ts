import child_process from 'child_process';
import {
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
    const { args, ip, binPath } = config;
    let { port } = config;

    // Optimization: Instead of using getFreePort() which has a race condition (port can be taken
    // between check and use) and is slower (requires creating a dummy server), we let NATS
    // pick a random port by passing -1. We then parse the port from the logs.
    if (port === undefined) {
      port = -1;
    }

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

      this.process.stderr.on(`data`, (data: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const dataStr = data?.toString();

        if (verbose && dataStr != null) {
          logger.log(dataStr);
        }

        // Parse the port from the NATS server log.
        // NATS logs "Listening for client connections on <ip>:<port>".
        // This allows us to know which random port was assigned.
        const portMatch = dataStr?.match(
          /Listening for client connections on [0-9.]+:(\d+)/,
        );

        if (portMatch != null) {
          this.port = parseInt(portMatch[1], 10);
        }

        if (dataStr?.includes(`Server is ready`) === true) {
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

        resolve();
      });

      this.process?.kill();
    });
  }
}
