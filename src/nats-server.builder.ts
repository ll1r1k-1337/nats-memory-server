import {
  type NatsServerOptions,
  NatsServer,
  DEFAULT_NATS_SERVER_OPTIONS,
  type Logger,
} from './index';

export class NatsServerBuilder {
  // ⚡ Bolt: Use direct property assignment instead of object spreading to prevent unnecessary object allocations
  private readonly options: NatsServerOptions = {
    ...DEFAULT_NATS_SERVER_OPTIONS,
  };

  constructor(options?: Partial<NatsServerOptions>) {
    if (options != null) {
      Object.assign(this.options, options);
    }
  }

  static create(options?: Partial<NatsServerOptions>): NatsServerBuilder {
    return new NatsServerBuilder(options);
  }

  setBinPath(binPath: string): this {
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
