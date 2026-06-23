# Opt-in Monitoring Port + Robust Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in HTTP monitoring port (`enableMonitoring()`/`setMonitoringPort()` → `getMonitoringUrl()`), use `GET /healthz` for deterministic readiness when it is enabled, and add a bounded start timeout so `start()` can never hang forever.

**Architecture:** A new `waitForHealthz` poller (node:http) is the readiness signal when monitoring is enabled; the existing stderr `Server is ready` scan remains the signal when monitoring is off. A single `AbortController` + `setTimeout` inside `start()` bounds both paths and is cleared/aborted in every settlement path. Monitoring is **off by default**, so default spawn args and behavior are unchanged except that `start()` is now time-bounded.

**Tech Stack:** TypeScript (CommonJS, strict, target es2016), Node’s built-in `http`/`AbortController`, Jest + ts-jest. The real `nats-server` v2.9.16 binary is used for integration tests.

## Global Constraints

- **Monitoring off by default.** `monitoring` default is `false`; when off, the `spawn` argument array MUST stay exactly `['--addr', ip, '--port', String(port), ...args]` (an existing test asserts this).
- **Use `node:http`** for the healthz poll — NOT `make-fetch-happen`. The endpoint is always local; no proxy handling, no new dependency.
- **Config precedence:** built-in defaults < project config file < explicit code options. New options participate via `pickRuntimeOptions`.
- **String style:** every string literal uses **backticks** (the repo’s `@typescript-eslint/quotes` rule). Match it.
- **Node ≥ 16** baseline (`AbortController`, `AbortSignal`, `http.get(url, { signal }, cb)` are all available).
- **Pre-commit hook runs `npm test` (full suite) + lint-staged.** The worktree already has the binary cached at `node_modules/.cache/nats-memory-server/nats-server.exe`, so integration tests run here.
- **Spec:** [docs/superpowers/specs/2026-06-23-monitoring-port-design.md](../specs/2026-06-23-monitoring-port-design.md).
- Verified vs the real v2.9.16 binary: flag is `-m, --http_port <port>`; `GET /healthz` → `200 {"status":"ok"}`; the monitor binds to the `--addr` host.

---

## Task 1: `waitForHealthz` polling utility

**Files:**
- Create: `src/utils/wait-for-healthz.ts`
- Test: `src/utils/wait-for-healthz.spec.ts`
- Modify: `src/utils/index.ts` (add one export line)

**Interfaces:**
- Produces: `waitForHealthz(url: string, options?: { intervalMs?: number; signal?: AbortSignal }): Promise<void>` — resolves on the first 2xx, retries other responses/errors after `intervalMs` (default 50), rejects only when `signal` aborts. Also exports `interface WaitForHealthzOptions`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/wait-for-healthz.spec.ts`:

```ts
import http from 'http';
import type { AddressInfo } from 'net';
import { waitForHealthz } from './wait-for-healthz';

async function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, `127.0.0.1`, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/healthz`,
    close: async () =>
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

describe(`waitForHealthz`, () => {
  it(`resolves once the endpoint returns 200`, async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(200);
      res.end(`{"status":"ok"}`);
    });
    try {
      await expect(
        waitForHealthz(url, { intervalMs: 10 }),
      ).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  it(`retries through non-2xx responses until one succeeds`, async () => {
    let hits = 0;
    const { url, close } = await startServer((_req, res) => {
      hits += 1;
      if (hits < 3) {
        res.writeHead(503);
        res.end(`not ready`);
      } else {
        res.writeHead(200);
        res.end(`ok`);
      }
    });
    try {
      await expect(
        waitForHealthz(url, { intervalMs: 10 }),
      ).resolves.toBeUndefined();
      expect(hits).toBeGreaterThanOrEqual(3);
    } finally {
      await close();
    }
  });

  it(`rejects when the signal aborts`, async () => {
    const { url, close } = await startServer((_req, res) => {
      res.writeHead(503);
      res.end(`never ready`);
    });
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 50);
    try {
      await expect(
        waitForHealthz(url, { intervalMs: 10, signal: controller.signal }),
      ).rejects.toThrow(/aborted/);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/wait-for-healthz.spec.ts`
Expected: FAIL — `Cannot find module './wait-for-healthz'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/wait-for-healthz.ts`:

```ts
import http from 'http';

export interface WaitForHealthzOptions {
  /** Delay between poll attempts in milliseconds. Default: 50. */
  intervalMs?: number;
  /** Abort to stop polling; the returned promise rejects when aborted. */
  signal?: AbortSignal;
}

const DEFAULT_INTERVAL_MS = 50;

/** A single GET. Resolves true on a 2xx response, false on any error/non-2xx. */
async function probeOnce(url: string, signal?: AbortSignal): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const request = http.get(url, { signal }, (response) => {
      const status = response.statusCode ?? 0;
      response.resume(); // drain so the socket frees promptly
      resolve(status >= 200 && status < 300);
    });
    request.on(`error`, () => {
      resolve(false);
    });
  });
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error(`waitForHealthz aborted`));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener(`abort`, onAbort);
      resolve();
    }, ms);
    if (signal != null) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener(`abort`, onAbort, { once: true });
    }
  });
}

/**
 * Polls `GET <url>` until it returns a 2xx response, then resolves. Connection
 * errors and non-2xx responses (the server is still coming up) are retried
 * after `intervalMs`. Rejects only when `signal` aborts. Uses node:http — the
 * target is always local, so no proxy handling is needed.
 */
export async function waitForHealthz(
  url: string,
  options: WaitForHealthzOptions = {},
): Promise<void> {
  const { intervalMs = DEFAULT_INTERVAL_MS, signal } = options;

  for (;;) {
    if (signal?.aborted === true) {
      throw new Error(`waitForHealthz aborted`);
    }

    if (await probeOnce(url, signal)) {
      return;
    }

    await delay(intervalMs, signal);
  }
}
```

Add to `src/utils/index.ts` (append after the last export):

```ts
export * from './wait-for-healthz';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/utils/wait-for-healthz.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/wait-for-healthz.ts src/utils/wait-for-healthz.spec.ts src/utils/index.ts
git commit -m "feat: add waitForHealthz polling utility"
```

---

## Task 2: Options, config fields, and builder setters (plumbing)

Adds the `monitoring` and `startTimeoutMs` options, their config-file fields, their config-merge wiring, and the four builder methods. **No `start()` behavior changes yet** — those land in Task 3.

**Files:**
- Modify: `src/nats-server.ts` (`NatsServerOptions`, `DEFAULT_NATS_SERVER_OPTIONS`, `pickRuntimeOptions`)
- Modify: `src/utils/get-project-config.ts` (`NatsMemoryServerConfig`)
- Modify: `src/nats-server.builder.ts` (four new methods)
- Test: `src/nats-server.builder.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `NatsServerOptions` gains `monitoring: boolean | number` and `startTimeoutMs: number`.
  - `NatsServerBuilder.enableMonitoring(): this` (sets `monitoring = true`), `disableMonitoring(): this` (sets `monitoring = false`), `setMonitoringPort(port: number): this` (sets `monitoring = port`), `setStartTimeout(ms: number): this` (sets `startTimeoutMs = ms`).
  - `NatsMemoryServerConfig` gains optional `monitoring?: boolean | number` and `startTimeoutMs?: number`.

- [ ] **Step 1: Write the failing tests**

Append to the `describe` block in `src/nats-server.builder.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/nats-server.builder.spec.ts`
Expected: FAIL — `enableMonitoring is not a function` (and the others).

- [ ] **Step 3: Implement the option type and defaults**

In `src/nats-server.ts`, extend the `NatsServerOptions` interface (add the two fields):

```ts
export interface NatsServerOptions {
  verbose: boolean;
  args: string[];
  port?: number;
  ip: string;
  logger: Logger;
  binPath?: string;
  /** HTTP monitoring port: `false` disables it, `true` picks a free port, a number uses that port. */
  monitoring: boolean | number;
  /** How long start() waits for readiness before failing, in milliseconds. */
  startTimeoutMs: number;
}
```

Extend `DEFAULT_NATS_SERVER_OPTIONS` (add the two defaults):

```ts
export const DEFAULT_NATS_SERVER_OPTIONS = {
  verbose: true,
  // Bind to loopback by default so the ephemeral test broker is not exposed,
  // unauthenticated, on every network interface. Opt into a wider bind (e.g.
  // `0.0.0.0`) explicitly via setIp() when cross-host access is actually needed.
  ip: `127.0.0.1`,
  args: [],
  logger: console,
  monitoring: false,
  startTimeoutMs: 30000,
} satisfies NatsServerOptions;
```

Extend `pickRuntimeOptions` (add two blocks before `return runtime;`):

```ts
  if (config.monitoring !== undefined) {
    runtime.monitoring = config.monitoring;
  }
  if (config.startTimeoutMs !== undefined) {
    runtime.startTimeoutMs = config.startTimeoutMs;
  }
```

In `src/utils/get-project-config.ts`, add to the `NatsMemoryServerConfig` interface (after the existing `args?` field):

```ts
  /** Runtime: HTTP monitoring port. `false` (default) / `true` (free port) / number. */
  monitoring?: boolean | number;
  /** Runtime: readiness timeout in milliseconds. Default: `30000`. */
  startTimeoutMs?: number;
```

- [ ] **Step 4: Implement the builder methods**

In `src/nats-server.builder.ts`, add these methods inside the class (e.g. after `setArgs`):

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/nats-server.builder.spec.ts`
Expected: PASS — the new tests plus all existing builder tests.

- [ ] **Step 6: Verify nothing else regressed (no behavior change yet)**

Run: `npx jest src/nats-server.spec.ts src/nats-server.project-config.spec.ts`
Expected: PASS — defaults add `monitoring:false`/`startTimeoutMs:30000`, so spawn args and readiness are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/nats-server.ts src/utils/get-project-config.ts src/nats-server.builder.ts src/nats-server.builder.spec.ts
git commit -m "feat: add monitoring/startTimeout options and builder setters"
```

---

## Task 3: Rewrite `start()` — bounded timeout + monitoring/healthz readiness

Consumes the Task 2 options. Adds the `monitorPort` field, `getMonitoringUrl()`, the `-m` spawn arg, a shared `AbortController` + timeout, and the healthz readiness path. This is where the three new behaviors become live.

**Files:**
- Modify: `src/nats-server.ts` (import, `monitorPort` field, `start()`, `getMonitoringUrl()`)
- Test: `src/nats-server.spec.ts`
- Test: `src/nats-server.project-config.spec.ts`

**Interfaces:**
- Consumes: `waitForHealthz` (Task 1); `NatsServerOptions.monitoring` / `.startTimeoutMs` (Task 2).
- Produces: `NatsServer.getMonitoringUrl(): string | undefined` — `http://<host>:<monitorPort>` when monitoring is enabled and `start()` resolved; otherwise `undefined`.

- [ ] **Step 1: Write the failing tests (nats-server.spec.ts)**

In `src/nats-server.spec.ts`, add the `http` import at the top (with the other imports):

```ts
import http from 'http';
```

Add this fake-child helper next to `makeFloodingChild` (a child that spawns, stays alive, and never signals readiness on its own):

```ts
/**
 * A fake child that spawns successfully and stays alive but NEVER writes a
 * readiness line. Used to exercise the start timeout and the healthz path,
 * where readiness must come from somewhere other than stderr.
 */
function makeSilentChild(): ChildProcessWithoutNullStreams {
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
```

Add these tests inside the `describe(NatsServer.name, ...)` block:

```ts
it(`Should reject start() if the server never becomes ready within the timeout`, async () => {
  const spawnSpy = jest
    .spyOn(child_process, `spawn`)
    .mockImplementation(() => makeSilentChild());

  try {
    const server = NatsServerBuilder.create()
      .setVerbose(false)
      .setBinPath(`fake-nats-server`)
      .setStartTimeout(150)
      .build();

    await expect(server.start()).rejects.toThrow(/did not become ready/);
  } finally {
    spawnSpy.mockRestore();
  }
});

it(`Should return undefined from getMonitoringUrl when monitoring is disabled`, () => {
  const server = NatsServerBuilder.create().build();
  expect(server.getMonitoringUrl()).toBeUndefined();
});

it(`Should become ready via /healthz and expose getMonitoringUrl when monitoring is enabled`, async () => {
  const monitorPort = await getFreePort();
  const healthServer = http.createServer((req, res) => {
    if (req.url === `/healthz`) {
      res.writeHead(200);
      res.end(`{"status":"ok"}`);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => {
    healthServer.listen(monitorPort, `127.0.0.1`, resolve);
  });

  const spawnSpy = jest
    .spyOn(child_process, `spawn`)
    .mockImplementation(() => makeSilentChild());

  try {
    const server = NatsServerBuilder.create()
      .setVerbose(false)
      .setBinPath(`fake-nats-server`)
      .setIp(`127.0.0.1`)
      .setPort(45330)
      .setMonitoringPort(monitorPort)
      .build();

    await withTimeout(server.start(), 5000, `monitoring start()`);

    expect(server.getMonitoringUrl()).toBe(`http://127.0.0.1:${monitorPort}`);
    expect(spawnSpy).toHaveBeenCalledWith(
      `fake-nats-server`,
      [`--addr`, `127.0.0.1`, `--port`, `45330`, `-m`, String(monitorPort)],
      { stdio: `pipe` },
    );

    await server.stop();
  } finally {
    spawnSpy.mockRestore();
    await new Promise<void>((resolve) => {
      healthServer.close(() => {
        resolve();
      });
    });
  }
});

it(`Should expose a working /healthz endpoint with the real server`, async () => {
  const server = await NatsServerBuilder.create()
    .setVerbose(false)
    .enableMonitoring()
    .build()
    .start();

  try {
    const url = server.getMonitoringUrl();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const status = await new Promise<number>((resolve, reject) => {
      http
        .get(`${url as string}/healthz`, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on(`error`, reject);
    });
    expect(status).toBe(200);

    const nc = await connect({ servers: server.getUrl() });
    expect(nc.isClosed()).toBe(false);
    await nc.close();
  } finally {
    await server.stop();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/nats-server.spec.ts`
Expected: FAIL — `getMonitoringUrl is not a function`; the timeout test does not reject (start hangs → its own `withTimeout`/jest timeout); the `-m` arg assertion fails.

- [ ] **Step 3: Implement — import, field, getMonitoringUrl, and the new start()**

In `src/nats-server.ts`, update the import to include `waitForHealthz`:

```ts
import {
  getFreePort,
  getProjectConfig,
  getProjectPath,
  waitForHealthz,
  type NatsMemoryServerConfig,
} from './utils';
```

Add the field next to `private port!: number;`:

```ts
  private monitorPort?: number;
```

Replace the entire `start()` method with:

```ts
  async start(): Promise<this> {
    const projectConfig = await getProjectConfig(getProjectPath());

    const config: NatsServerOptions = {
      ...DEFAULT_NATS_SERVER_OPTIONS,
      ...pickRuntimeOptions(projectConfig),
      ...this.options,
    };
    this.resolvedOptions = config;

    const { verbose, logger } = config;

    if (this.process != null) {
      const message = `Nats server already started at ${this.getUrl()}`;

      if (verbose) {
        logger.warn(message);
      }

      return this;
    }

    const {
      args,
      ip,
      port = await getFreePort(),
      binPath,
      monitoring,
      startTimeoutMs,
    } = config;

    if (binPath == null) {
      throw new Error(`Could not resolve a binPath for the NATS server binary`);
    }

    // Resolve the monitoring port. `undefined` means monitoring is disabled; a
    // free port is allocated when monitoring is enabled without an explicit one.
    const monitorPort =
      monitoring === false
        ? undefined
        : typeof monitoring === `number`
        ? monitoring
        : await getFreePort();

    this.host = ip;
    this.port = port;
    this.monitorPort = monitorPort;

    const spawnArgs =
      monitorPort !== undefined
        ? [
            `--addr`,
            ip,
            `--port`,
            port.toString(),
            `-m`,
            monitorPort.toString(),
            ...args,
          ]
        : [`--addr`, ip, `--port`, port.toString(), ...args];

    return await new Promise((resolve, reject) => {
      const child = child_process.spawn(binPath, spawnArgs, { stdio: `pipe` });
      this.process = child;

      // Drain stdout so a child that writes heavily to stdout can't deadlock by
      // filling the OS pipe buffer while we wait for readiness.
      child.stdout.resume();

      let isReady = false;
      let settled = false;

      // A single controller + timer bounds the whole readiness wait and stops
      // the healthz poller. Cleared/aborted in every settlement path so nothing
      // outlives start().
      const controller = new AbortController();

      const settleReject = (error: Error): void => {
        clearTimeout(timer);
        controller.abort();
        if (settled) {
          return;
        }
        settled = true;
        this.process = undefined;
        reject(error);
      };

      const markReady = (): void => {
        if (settled) {
          return;
        }
        isReady = true;
        settled = true;
        clearTimeout(timer);
        controller.abort();
        if (verbose) {
          logger.log(`NATS server is ready!`);
        }
        resolve(this);
        child.unref();
      };

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        // Kill the child we could not confirm ready, then fail loudly.
        child.kill();
        if (verbose) {
          logger.warn(
            `NATS server did not become ready within ${startTimeoutMs}ms`,
          );
        }
        settleReject(
          new Error(
            `NATS server did not become ready within ${startTimeoutMs}ms`,
          ),
        );
      }, startTimeoutMs);
      timer.unref();

      child.once(`error`, (err) => {
        if (verbose) {
          logger.error(`NATS server error:`, err);
        }
        // After readiness, settleReject() is a no-op (settled) and leaves the
        // running handle intact — a transient post-ready error must not tear it
        // down. Before readiness it rejects the start Promise.
        settleReject(err);
      });

      // When monitoring is enabled, readiness is decided by the HTTP monitoring
      // endpoint — deterministic and independent of log text.
      if (monitorPort !== undefined) {
        const healthHost = ip === `0.0.0.0` ? `127.0.0.1` : ip;
        const healthUrl = `http://${healthHost}:${monitorPort}/healthz`;
        void waitForHealthz(healthUrl, { signal: controller.signal })
          .then(() => {
            markReady();
          })
          .catch(() => {
            // Aborted by the timeout/error/close path, which has already
            // settled the Promise; nothing to do here.
          });
      }

      child.stderr.on(`data`, (data: unknown) => {
        // Once ready, non-verbose mode has nothing left to do on this stream.
        if (isReady && !verbose) {
          return;
        }

        let dataStr: string | undefined;
        if (Buffer.isBuffer(data)) {
          if (verbose) {
            dataStr = data.toString();
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          dataStr = data?.toString();
        }

        if (verbose && dataStr != null) {
          logger.log(dataStr);
        }

        // Stderr is the readiness signal only when monitoring is disabled.
        if (monitorPort === undefined && !isReady) {
          const ready = Buffer.isBuffer(data)
            ? data.includes(`Server is ready`)
            : dataStr?.includes(`Server is ready`) === true;

          if (ready) {
            markReady();
          }
        }
      });

      child.once(`close`, (code) => {
        // The child has exited: clear the handle so a later stop() does not
        // kill() a dead process and so start() can spawn a fresh server later.
        this.process = undefined;
        clearTimeout(timer);
        controller.abort();

        if (verbose) {
          logger.log(`NATS server was stop!`);
        }

        // Exiting before readiness is always a failure regardless of exit code.
        if (!settled) {
          const message = `NATS server exited before becoming ready${
            code !== null ? ` (exit code: ${code})` : ``
          }`;

          if (verbose) {
            logger.warn(message, code);
          }

          settleReject(new Error(message));
        }
      });
    });
  }
```

Add the `getMonitoringUrl()` method (next to `getUrl()`):

```ts
  public getMonitoringUrl(): string | undefined {
    if (this.monitorPort === undefined) {
      return undefined;
    }
    return `http://${this.host}:${this.monitorPort}`;
  }
```

- [ ] **Step 4: Run the nats-server tests to verify they pass**

Run: `npx jest src/nats-server.spec.ts`
Expected: PASS — new timeout/monitoring/healthz tests plus all existing tests (the flood test’s exact-args assertion still holds because monitoring defaults to off).

- [ ] **Step 5: Write the config-file failing tests (project-config.spec.ts)**

In `src/nats-server.project-config.spec.ts`, add imports at the top:

```ts
import http from 'http';
import type { AddressInfo } from 'net';
```

Add a never-ready fake child helper next to `makeFakeChild`:

```ts
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
```

Add these tests inside the `describe(...)` block:

```ts
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
```

- [ ] **Step 6: Run the project-config tests to verify they pass**

Run: `npx jest src/nats-server.project-config.spec.ts`
Expected: PASS — the two new tests plus all existing config tests (monitoring stays off in those, so their exact-args assertions are unchanged).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — all suites.

- [ ] **Step 8: Commit**

```bash
git add src/nats-server.ts src/nats-server.spec.ts src/nats-server.project-config.spec.ts
git commit -m "feat: monitoring port with /healthz readiness and bounded start timeout"
```

---

## Task 4: Document the feature and verify the build

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Monitoring section to the README**

Insert this section immediately after the JetStream `</details>` block (around `README.md:256`, before the `---` that precedes “🧪 Testing with Jest”):

````markdown
---

## 📈 Monitoring & readiness

Enable the `nats-server` HTTP monitoring endpoint and read its URL. When monitoring
is enabled, readiness is detected via `GET /healthz` instead of scanning the log
output, which is robust to log formatting and routing.

```ts
const { NatsServerBuilder } = require('nats-memory-server');

const server = await NatsServerBuilder.create()
  .enableMonitoring() // or .setMonitoringPort(8222) for a fixed port
  .build()
  .start();

console.log(server.getMonitoringUrl()); // e.g. http://127.0.0.1:8222
// GET `${server.getMonitoringUrl()}/healthz` -> 200 {"status":"ok"}
// GET `${server.getMonitoringUrl()}/varz`    -> server stats
```

| Method | Description |
| ------------------------------ | ------------------------------------------------------------ |
| `enableMonitoring()`           | Enable monitoring on an automatically chosen free port.       |
| `disableMonitoring()`          | Disable monitoring (the default).                             |
| `setMonitoringPort(port)`      | Enable monitoring on an explicit port.                        |
| `getMonitoringUrl()`           | `http://host:port` when enabled and started, else `undefined`.|

Monitoring is **off by default**. It can also be set in a config file via
`"monitoring": true` (or a port number).

`start()` is bounded by a readiness timeout (default `30000` ms). Adjust it with
`setStartTimeout(ms)` or the `startTimeoutMs` config option; on expiry `start()`
rejects and the child process is terminated.
````

- [ ] **Step 2: Verify the full suite still passes**

Run: `npm test`
Expected: PASS — all suites (docs-only change).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document monitoring port, getMonitoringUrl, and start timeout"
```

---

## Self-Review

**Spec coverage:**
- `enableMonitoring`/`disableMonitoring`/`setMonitoringPort`/`setStartTimeout` → Task 2.
- `getMonitoringUrl()` → Task 3 (Step 3) + tests.
- `monitoring` / `startTimeoutMs` options + defaults + config-file fields + precedence → Task 2 (+ config-file tests in Task 3 Steps 5–6).
- `-m` spawn arg only when enabled; default args unchanged → Task 3 (asserted by the monitoring test’s args check and the unchanged flood/config tests).
- `/healthz` readiness via `waitForHealthz` (node:http) → Task 1 + Task 3.
- Bounded timeout + AbortController, cleared/aborted in all settlement paths → Task 3 (Step 3).
- `0.0.0.0` → poll `127.0.0.1` → Task 3 (`healthHost`).
- README monitoring docs → Task 4.
- Out-of-scope items (client-port race, orphan cleanup, stop() timeout) are intentionally not implemented.

**Placeholder scan:** none — every code step contains full code; every run step has an exact command and expected result.

**Type consistency:** `monitoring: boolean | number` and `startTimeoutMs: number` are used identically across `NatsServerOptions`, `DEFAULT_NATS_SERVER_OPTIONS`, `pickRuntimeOptions`, `NatsMemoryServerConfig`, and the builder. `waitForHealthz(url, { intervalMs?, signal? })` matches between Task 1’s definition and Task 3’s call. `getMonitoringUrl(): string | undefined` matches between definition and tests. `monitorPort` (resolved local + `this.monitorPort` field) is consistent.
