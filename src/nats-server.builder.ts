import {
  type NatsServerOptions,
  NatsServer,
  DEFAULT_NATS_SERVER_OPTIONS,
  type Logger,
} from './index';

export class NatsServerBuilder {
  // ⚡ Bolt: Clone default options to safely allow direct property mutation later.
  // Using readonly since the object reference is never reassigned after construction.
  private readonly options: NatsServerOptions = {
    ...DEFAULT_NATS_SERVER_OPTIONS,
  };

  constructor(options?: Partial<NatsServerOptions>) {
    if (options != null) {
      this.options = { ...this.options, ...options };
    }
  }

  static create(options?: Partial<NatsServerOptions>): NatsServerBuilder {
    return new NatsServerBuilder(options);
  }

  // ⚡ Bolt: Direct property mutation avoids expensive object allocations compared to object spreading
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
