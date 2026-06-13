import {
  type NatsServerOptions,
  NatsServer,
  DEFAULT_NATS_SERVER_OPTIONS,
  type Logger,
} from './index';

export class NatsServerBuilder {
  private options: NatsServerOptions = DEFAULT_NATS_SERVER_OPTIONS;

  constructor(options?: Partial<NatsServerOptions>) {
    if (options != null) {
      this.options = { ...this.options, ...options };
    }
  }

  static create(options?: Partial<NatsServerOptions>): NatsServerBuilder {
    return new NatsServerBuilder(options);
  }

  setBinPath(binPath: string): this {
    this.options = { ...this.options, binPath };
    return this;
  }

  setVerbose(verbose: boolean): this {
    this.options = { ...this.options, verbose };
    return this;
  }

  setPort(port: number): this {
    this.options = { ...this.options, port };
    return this;
  }

  setIp(ip: string): this {
    this.options = { ...this.options, ip };
    return this;
  }

  setArgs(args: string[]): this {
    this.options = { ...this.options, args };
    return this;
  }

  setLogger(logger: Logger): this {
    this.options = { ...this.options, logger };
    return this;
  }

  setStartupTimeoutMs(startupTimeoutMs: number): this {
    this.options = { ...this.options, startupTimeoutMs };
    return this;
  }

  build(): NatsServer {
    const server = new NatsServer(this.options);
    return server;
  }
}
