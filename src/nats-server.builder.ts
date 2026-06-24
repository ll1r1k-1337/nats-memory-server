import { type NatsServerOptions, NatsServer, type Logger } from './index';

export class NatsServerBuilder {
  // Keep only the options that were explicitly provided. Built-in defaults
  // and the project config file are merged in NatsServer.start(), so an
  // option left unset here can still be supplied by a config file.
  private options: Partial<NatsServerOptions> = {};

  constructor(options?: Partial<NatsServerOptions>) {
    if (options != null) {
      this.options = { ...options };
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

  enableMonitoring(): this {
    this.options = { ...this.options, monitoring: true };
    return this;
  }

  disableMonitoring(): this {
    this.options = { ...this.options, monitoring: false };
    return this;
  }

  setMonitoringPort(port: number): this {
    this.options = { ...this.options, monitoring: port };
    return this;
  }

  setStartTimeout(ms: number): this {
    this.options = { ...this.options, startTimeoutMs: ms };
    return this;
  }

  setLogger(logger: Logger): this {
    this.options = { ...this.options, logger };
    return this;
  }

  build(): NatsServer {
    const server = new NatsServer(this.options);
    return server;
  }
}
