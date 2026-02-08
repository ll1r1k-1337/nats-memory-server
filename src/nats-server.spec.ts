import { NatsServer } from './nats-server';
import { NatsServerBuilder } from './nats-server.builder';
import { connect, StringCodec } from 'nats';

describe(NatsServer.name, () => {
  it(`Should start and stop NATS server`, async () => {
    const server = await NatsServerBuilder.create().build().start();

    const natsCilent = await connect({ servers: server.getUrl() });

    const sc = StringCodec();
    const sub = natsCilent.subscribe(`hello`, { max: 1 });

    natsCilent.publish(`hello`, sc.encode(`world`));

    for await (const m of sub) {
      const msg = sc.decode(m.data);
      expect(msg).toStrictEqual(`world`);
    }
    await natsCilent.close();
    await server.stop();
  });

  it(`Should return same instance if start is called multiple times`, async () => {
    const server = NatsServerBuilder.create().build();
    const instance1 = await server.start();
    const instance2 = await server.start();
    expect(instance1).toBe(instance2);
    await server.stop();
  });

  it(`Should resolve stop immediately if server is not running`, async () => {
    const server = NatsServerBuilder.create().build();
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it(`Should return correct url, host and port`, async () => {
    const port = 45321;
    const ip = `127.0.0.1`;
    const server = NatsServerBuilder.create().setPort(port).setIp(ip).build();

    await server.start();

    expect(server.getPort()).toBe(port);
    expect(server.getHost()).toBe(ip);
    expect(server.getUrl()).toBe(`nats://${ip}:${port}`);

    await server.stop();
  });

  it(`Should use custom logger`, async () => {
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // We need verbose to be true for logger to be called during start/stop
    const server = NatsServerBuilder.create()
      .setLogger(logger)
      .setVerbose(true)
      .build();

    await server.start();
    await server.stop();

    expect(logger.log).toHaveBeenCalled();
  });
});

it(`Should assign random port when port is 0`, async () => {
  const server = NatsServerBuilder.create().setPort(0).build();
  await server.start();
  expect(server.getPort()).toBeGreaterThan(0);
  expect(server.getPort()).not.toBe(0);
  await server.stop();
});
