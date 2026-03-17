import {
  type NatsServerOptions,
  NatsServer,
  DEFAULT_NATS_SERVER_OPTIONS,
  type Logger,
} from './index';

export class NatsServerBuilder {
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

  setBinPath(binPath: string): this {
    // ⚡ Bolt: Direct assignment avoids expensive object spread allocation
    this.options.binPath = binPath;
    return this;
  }

  setVerbose(verbose: boolean): this {
    // ⚡ Bolt: Direct assignment avoids expensive object spread allocation
    this.options.verbose = verbose;
    return this;
  }

  setPort(port: number): this {
    // ⚡ Bolt: Direct assignment avoids expensive object spread allocation
    this.options.port = port;
    return this;
  }

  setIp(ip: string): this {
    // ⚡ Bolt: Direct assignment avoids expensive object spread allocation
    this.options.ip = ip;
    return this;
  }

  setArgs(args: string[]): this {
    // ⚡ Bolt: Direct assignment avoids expensive object spread allocation
    this.options.args = args;
    return this;
  }

  setLogger(logger: Logger): this {
    // ⚡ Bolt: Direct assignment avoids expensive object spread allocation
    this.options.logger = logger;
    return this;
  }

  build(): NatsServer {
    const server = new NatsServer(this.options);
    return server;
  }
}
