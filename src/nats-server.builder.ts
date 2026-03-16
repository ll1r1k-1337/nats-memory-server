import {
  type NatsServerOptions,
  NatsServer,
  DEFAULT_NATS_SERVER_OPTIONS,
  type Logger,
} from './index';

export class NatsServerBuilder {
  private readonly options: NatsServerOptions;

  constructor(options?: Partial<NatsServerOptions>) {
    // Clone DEFAULT_NATS_SERVER_OPTIONS to avoid mutating shared global state
    this.options = { ...DEFAULT_NATS_SERVER_OPTIONS };
    if (options != null) {
      this.options = { ...this.options, ...options };
    }
  }

  static create(options?: Partial<NatsServerOptions>): NatsServerBuilder {
    return new NatsServerBuilder(options);
  }

  setBinPath(binPath: string): this {
    // Optimize: direct property assignment avoids unnecessary object allocations
    this.options.binPath = binPath;
    return this;
  }

  setVerbose(verbose: boolean): this {
    this.options.verbose = verbose;
    return this;
  }

  setPort(port: number): this {
    this.options.port = port;
    return this;
  }

  setIp(ip: string): this {
    this.options.ip = ip;
    return this;
  }

  setArgs(args: string[]): this {
    this.options.args = args;
    return this;
  }

  setLogger(logger: Logger): this {
    this.options.logger = logger;
    return this;
  }

  build(): NatsServer {
    const server = new NatsServer(this.options);
    return server;
  }
}
