import { NatsServerBuilder } from './nats-server.builder';

describe(`NatsServer Optimization`, () => {
  it(`Should start NATS server with verbose: false`, async () => {
    // This forces the "fast path" using Buffer.includes
    const server = NatsServerBuilder.create().setVerbose(false).build();

    await expect(server.start()).resolves.toBe(server);
    await server.stop();
  });

  it(`Should start NATS server with verbose: true`, async () => {
    // This forces the "slow path" using toString() but optimized to check once
    const server = NatsServerBuilder.create().setVerbose(true).build();

    await expect(server.start()).resolves.toBe(server);
    await server.stop();
  });
});
