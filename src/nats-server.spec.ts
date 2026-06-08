import { NatsServer } from './nats-server';
import { NatsServerBuilder } from './nats-server.builder';
import { getFreePort } from './utils';
import { connect, StringCodec } from 'nats';

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

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

  it(`Should reject start() when the server exits before becoming ready (port already in use)`, async () => {
    const ip = `127.0.0.1`;
    const port = await getFreePort();

    const blocker = await NatsServerBuilder.create()
      .setIp(ip)
      .setPort(port)
      .setVerbose(false)
      .build()
      .start();

    try {
      const second = NatsServerBuilder.create()
        .setIp(ip)
        .setPort(port)
        .setVerbose(false)
        .build();

      await expect(second.start()).rejects.toThrow();
    } finally {
      await blocker.stop();
    }
  });

  it(`Should not hang when stop() is called after the process already exited`, async () => {
    const server = NatsServerBuilder.create().setVerbose(false).build();
    await server.start();

    // Simulate the process dying on its own (a crash), independently of stop().
    const child = (
      server as unknown as {
        process: NodeJS.EventEmitter & { kill: () => void };
      }
    ).process;
    child.kill();
    await new Promise<void>((resolve) => {
      child.once(`close`, () => {
        resolve();
      });
    });

    await expect(
      withTimeout(server.stop(), 3000, `stop() after exit`),
    ).resolves.toBeUndefined();
  });

  it(`Should not hang when stop() is called twice`, async () => {
    const server = NatsServerBuilder.create().setVerbose(false).build();
    await server.start();
    await server.stop();

    await expect(
      withTimeout(server.stop(), 3000, `second stop()`),
    ).resolves.toBeUndefined();
  });

  it(`Should start a new running server after stop() (restart)`, async () => {
    const server = NatsServerBuilder.create()
      .setIp(`127.0.0.1`)
      .setVerbose(false)
      .build();

    await server.start();
    await server.stop();

    await withTimeout(server.start(), 5000, `restart start()`);

    const client = await connect({ servers: server.getUrl() });
    expect(client.isClosed()).toBe(false);
    await client.close();

    await server.stop();
  });

  it(`Should bind to loopback (127.0.0.1) by default`, async () => {
    const server = NatsServerBuilder.create().setVerbose(false).build();

    await server.start();

    try {
      expect(server.getHost()).toBe(`127.0.0.1`);
      expect(server.getUrl()).toMatch(/^nats:\/\/127\.0\.0\.1:/);
    } finally {
      await server.stop();
    }
  });

  it(`Should reject start() with a clear error when binPath is explicitly undefined`, async () => {
    const server = NatsServerBuilder.create({ binPath: undefined }).build();

    await expect(server.start()).rejects.toThrow(/binPath/);
  });
});
