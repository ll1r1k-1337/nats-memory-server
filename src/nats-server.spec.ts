import child_process from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough, Readable } from 'stream';
import { DEFAULT_NATS_SERVER_OPTIONS, NatsServer } from './nats-server';
import { NatsServerBuilder } from './nats-server.builder';
import { getFreePort } from './utils';
import { connect, StringCodec } from 'nats';

/**
 * A fake child process whose stdout is pre-loaded with more than one OS pipe
 * buffer of data. The readiness line is written to stderr ONLY after stdout has
 * been fully consumed — modelling a real child that blocks on a full stdout
 * pipe until the parent drains it. If start() never reads stdout, readiness is
 * never reached and start() hangs.
 */
function makeFloodingChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdout = new Readable({
    read() {
      // Data is pushed eagerly below; nothing to produce on demand.
    },
  });
  const stderr = new PassThrough();

  Object.assign(child, {
    stdout,
    stderr,
    exitCode: null,
    signalCode: null,
    unref: () => {
      // no-op: the fake child does not keep the event loop alive.
    },
    kill: () => {
      Object.assign(child, { exitCode: 0 });
      stdout.destroy();
      stderr.end();
      queueMicrotask(() => child.emit(`close`, 0, null));
      return true;
    },
  });

  stdout.push(Buffer.alloc(256 * 1024, 0x2e));
  stdout.push(null);
  stdout.once(`end`, () => {
    stderr.write(`[INF] Server is ready\n`);
  });

  return child;
}

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

  it(`Should drain stdout so a flood on stdout can't deadlock readiness on stderr`, async () => {
    const spawnSpy = jest
      .spyOn(child_process, `spawn`)
      .mockImplementation(() => makeFloodingChild());

    try {
      const server = new NatsServer({
        ...DEFAULT_NATS_SERVER_OPTIONS,
        verbose: false,
        port: 4222,
        binPath: `fake-nats-server`,
      });

      await expect(
        withTimeout(server.start(), 3000, `start() with flooded stdout`),
      ).resolves.toBe(server);

      expect(spawnSpy).toHaveBeenCalledTimes(1);
      expect(spawnSpy).toHaveBeenCalledWith(
        `fake-nats-server`,
        [`--addr`, `127.0.0.1`, `--port`, `4222`],
        { stdio: `pipe` },
      );

      await server.stop();
    } finally {
      spawnSpy.mockRestore();
    }
  });
});
