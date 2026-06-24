import { NatsServerBuilder } from './nats-server.builder';

describe(NatsServerBuilder.name, () => {
  it(`Should keep options empty when nothing is set (defaults are resolved at start())`, () => {
    // Baking DEFAULT_NATS_SERVER_OPTIONS in at build time would make every
    // option look explicitly set, so a project config file could never win.
    const builder = NatsServerBuilder.create();
    const server = builder.build();
    expect((server as any).options).toEqual({});
  });

  it(`Should set custom options via create`, () => {
    const customOptions = { port: 1234, verbose: false };
    const builder = NatsServerBuilder.create(customOptions);
    const server = builder.build();
    expect((server as any).options).toMatchObject(customOptions);
  });

  it(`Should set binPath`, () => {
    const builder = NatsServerBuilder.create().setBinPath(`/tmp/nats-server`);
    const server = builder.build();
    expect((server as any).options.binPath).toBe(`/tmp/nats-server`);
  });

  it(`Should set verbose`, () => {
    const builder = NatsServerBuilder.create().setVerbose(false);
    const server = builder.build();
    expect((server as any).options.verbose).toBe(false);
  });

  it(`Should set port`, () => {
    const builder = NatsServerBuilder.create().setPort(4222);
    const server = builder.build();
    expect((server as any).options.port).toBe(4222);
  });

  it(`Should set ip`, () => {
    const builder = NatsServerBuilder.create().setIp(`127.0.0.1`);
    const server = builder.build();
    expect((server as any).options.ip).toBe(`127.0.0.1`);
  });

  it(`Should set args`, () => {
    const args = [`--user`, `foo`];
    const builder = NatsServerBuilder.create().setArgs(args);
    const server = builder.build();
    expect((server as any).options.args).toBe(args);
  });

  it(`Should set logger`, () => {
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const builder = NatsServerBuilder.create().setLogger(logger);
    const server = builder.build();
    expect((server as any).options.logger).toBe(logger);
  });

  it(`Should enable monitoring`, () => {
    const server = NatsServerBuilder.create().enableMonitoring().build();
    expect((server as any).options.monitoring).toBe(true);
  });

  it(`Should disable monitoring`, () => {
    const server = NatsServerBuilder.create().disableMonitoring().build();
    expect((server as any).options.monitoring).toBe(false);
  });

  it(`Should set an explicit monitoring port`, () => {
    const server = NatsServerBuilder.create().setMonitoringPort(8222).build();
    expect((server as any).options.monitoring).toBe(8222);
  });

  it(`Should apply last-call-wins across monitoring setters`, () => {
    const a = NatsServerBuilder.create()
      .enableMonitoring()
      .setMonitoringPort(8222)
      .build();
    expect((a as any).options.monitoring).toBe(8222);

    const b = NatsServerBuilder.create()
      .setMonitoringPort(8222)
      .disableMonitoring()
      .build();
    expect((b as any).options.monitoring).toBe(false);
  });

  it(`Should set the start timeout`, () => {
    const server = NatsServerBuilder.create().setStartTimeout(5000).build();
    expect((server as any).options.startTimeoutMs).toBe(5000);
  });
});
