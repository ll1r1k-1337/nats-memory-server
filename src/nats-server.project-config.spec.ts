import child_process from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import http from 'http';
import type { AddressInfo } from 'net';
import { PassThrough } from 'stream';
import { NatsServer, type Logger } from './nats-server';
import { NatsServerBuilder } from './nats-server.builder';
import { getFreePort, getProjectConfig } from './utils';
import { type NatsMemoryServerConfig } from './utils';

jest.mock(`./utils`, () => {
  const actual = jest.requireActual(`./utils`);
  return {
    ...actual,
    getProjectConfig: jest.fn(),
    getFreePort: jest.fn(),
  };
});

const getProjectConfigMock = getProjectConfig as jest.MockedFunction<
  typeof getProjectConfig
>;
const getFreePortMock = getFreePort as jest.MockedFunction<typeof getFreePort>;

/**
 * A fake child process that becomes "ready" on its own: the readiness line is
 * written to stderr on the next macrotask, after start() has attached its
 * stream listeners. Lets these tests assert the exact spawn arguments without
 * needing a real nats-server binary.
 */
function makeFakeChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdout = new PassThrough();
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
      stdout.end();
      stderr.end();
      queueMicrotask(() => child.emit(`close`, 0, null));
      return true;
    },
  });

  setImmediate(() => {
    stderr.write(`[INF] Server is ready\n`);
  });

  return child;
}

function makeNeverReadyChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  Object.assign(child, {
    stdout,
    stderr,
    exitCode: null,
    signalCode: null,
    unref: () => {
      // no-op
    },
    kill: () => {
      Object.assign(child, { exitCode: 0 });
      stdout.end();
      stderr.end();
      queueMicrotask(() => child.emit(`close`, 0, null));
      return true;
    },
  });

  return child;
}

function makeProjectConfig(
  overrides: Partial<NatsMemoryServerConfig> = {},
): NatsMemoryServerConfig {
  return {
    download: true,
    downloadDir: `/tmp/nats-memory-server-cache`,
    version: `v2.9.16`,
    buildFromSource: false,
    binPath: `config-bin`,
    ...overrides,
  };
}

function makeLogger(): Logger & {
  log: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
} {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
}

describe(`${NatsServer.name} project-config runtime options`, () => {
  let spawnSpy: jest.SpyInstance;

  beforeEach(() => {
    spawnSpy = jest
      .spyOn(child_process, `spawn`)
      .mockImplementation(() => makeFakeChild());
    getFreePortMock.mockResolvedValue(23456);
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    getProjectConfigMock.mockReset();
    getFreePortMock.mockReset();
  });

  it(`Should apply runtime options from the project config when not set explicitly`, async () => {
    getProjectConfigMock.mockResolvedValue(
      makeProjectConfig({
        verbose: false,
        ip: `127.0.0.2`,
        port: 41234,
        args: [`--jetstream`],
      }),
    );

    const logger = makeLogger();
    const server = NatsServerBuilder.create().setLogger(logger).build();

    await server.start();

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(spawnSpy).toHaveBeenCalledWith(
      `config-bin`,
      [`--addr`, `127.0.0.2`, `--port`, `41234`, `--jetstream`],
      { stdio: `pipe` },
    );

    await server.stop();

    // verbose: false from the project config must silence start/stop logging.
    expect(logger.log).not.toHaveBeenCalled();
  });

  it(`Should let explicit builder options override the project config`, async () => {
    getProjectConfigMock.mockResolvedValue(
      makeProjectConfig({
        verbose: false,
        ip: `127.0.0.3`,
        port: 1111,
        args: [`--from-config`],
      }),
    );

    const logger = makeLogger();
    const server = NatsServerBuilder.create()
      .setVerbose(true)
      .setIp(`127.0.0.4`)
      .setPort(2222)
      .setArgs([`--explicit`])
      .setBinPath(`explicit-bin`)
      .setLogger(logger)
      .build();

    await server.start();

    expect(spawnSpy).toHaveBeenCalledWith(
      `explicit-bin`,
      [`--addr`, `127.0.0.4`, `--port`, `2222`, `--explicit`],
      { stdio: `pipe` },
    );

    // verbose: true set explicitly wins over the config's false.
    expect(logger.log).toHaveBeenCalled();

    await server.stop();
  });

  it(`Should fall back to built-in defaults when neither config nor options set a value`, async () => {
    getProjectConfigMock.mockResolvedValue(makeProjectConfig());

    const logger = makeLogger();
    const server = NatsServerBuilder.create().setLogger(logger).build();

    await server.start();

    // ip defaults to loopback, port to a free port, binPath flows from config.
    expect(spawnSpy).toHaveBeenCalledWith(
      `config-bin`,
      [`--addr`, `127.0.0.1`, `--port`, `23456`],
      { stdio: `pipe` },
    );

    // verbose defaults to true.
    expect(logger.log).toHaveBeenCalled();

    await server.stop();

    // stop() must observe the same resolved options as start(): with verbose
    // defaulting to true it logs the shutdown. Reading the raw (partial)
    // constructor options here would leave verbose undefined and stay silent.
    expect(logger.log).toHaveBeenCalledWith(
      `NATS server was stop at:`,
      expect.any(String),
    );
  });

  it(`Should let an explicitly-set undefined override the project config`, async () => {
    getProjectConfigMock.mockResolvedValue(
      makeProjectConfig({ binPath: `config-bin` }),
    );

    const server = NatsServerBuilder.create({ binPath: undefined })
      .setLogger(makeLogger())
      .build();

    await expect(server.start()).rejects.toThrow(/binPath/);
  });

  it(`Should support new NatsServer() with no arguments`, async () => {
    getProjectConfigMock.mockResolvedValue(
      makeProjectConfig({ verbose: false }),
    );

    const server = new NatsServer();

    await server.start();

    expect(spawnSpy).toHaveBeenCalledWith(
      `config-bin`,
      [`--addr`, `127.0.0.1`, `--port`, `23456`],
      { stdio: `pipe` },
    );

    await server.stop();
  });

  it(`Should enable monitoring from the project config`, async () => {
    const healthServer = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end(`{"status":"ok"}`);
    });
    await new Promise<void>((resolve) => {
      healthServer.listen(0, `127.0.0.1`, resolve);
    });
    const monitorPort = (healthServer.address() as AddressInfo).port;

    getProjectConfigMock.mockResolvedValue(
      makeProjectConfig({ verbose: false, monitoring: monitorPort }),
    );

    const server = NatsServerBuilder.create().setLogger(makeLogger()).build();

    await server.start();

    expect(spawnSpy).toHaveBeenCalledWith(
      `config-bin`,
      [`--addr`, `127.0.0.1`, `--port`, `23456`, `-m`, String(monitorPort)],
      { stdio: `pipe` },
    );
    expect(server.getMonitoringUrl()).toBe(`http://127.0.0.1:${monitorPort}`);

    await server.stop();
    await new Promise<void>((resolve) => {
      healthServer.close(() => {
        resolve();
      });
    });
  });

  it(`Should fail fast using startTimeoutMs from the project config`, async () => {
    spawnSpy.mockImplementation(() => makeNeverReadyChild());
    getProjectConfigMock.mockResolvedValue(
      makeProjectConfig({ verbose: false, startTimeoutMs: 120 }),
    );

    const server = NatsServerBuilder.create().setLogger(makeLogger()).build();

    await expect(server.start()).rejects.toThrow(/did not become ready/);
  });
});
