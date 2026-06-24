# Design: opt-in monitoring port + robust readiness

**Date:** 2026-06-23
**Status:** approved (pending written-spec review)
**Scope:** Step "B" of the growth roadmap — add an opt-in HTTP monitoring port and,
when it is enabled, use `GET /healthz` for deterministic readiness. Add a bounded
start timeout so `start()` can never hang forever. The free-port TOCTOU race for the
**client** port is explicitly **out of scope** (a later step, "C").

---

## 1. Motivation

Today `start()` ([src/nats-server.ts](../../../src/nats-server.ts)) decides readiness
solely by substring-matching `Server is ready` on the child's **stderr**
(`src/nats-server.ts:166-169`) and has **no timeout** — so if that exact line never
reaches stderr (custom `binPath` printing to stdout, `--log`/`--syslog` redirecting the
banner, upstream wording drift) `await server.start()` hangs indefinitely.

There is also no way to reach the `nats-server` HTTP monitoring endpoints
(`/healthz`, `/varz`, …) from a test.

This step adds an opt-in monitoring port that both (a) exposes those endpoints via
`getMonitoringUrl()`, and (b) becomes a deterministic readiness signal that does not
depend on log text. A bounded start timeout is added regardless of monitoring, which
also fixes the indefinite-hang defect for the default path.

## 2. Verified facts (nats-server v2.9.16, checked against the real binary)

- Flag: `-m, --http_port <port>` (HTTP monitoring). `--ports_file_dir <dir>` also exists.
- `GET http://<host>:<m>/healthz` → `200` with body `{"status":"ok"}` once ready.
- The HTTP monitor binds to the **`--addr` host**: starting with `-a 127.0.0.1 -m <m>`
  yields `/varz` `http_host: 127.0.0.1`. So `getMonitoringUrl()` = `http://<ip>:<m>`.
- `/varz` reports the real client `host`/`port` (relevant to the later port-race step,
  not used here).

## 3. Public API

### Builder — `NatsServerBuilder`

| Method | Behavior |
| --- | --- |
| `enableMonitoring(): this` | Enable monitoring; the monitoring port is auto-allocated (a free port) at `start()`. Sets `monitoring = true`. |
| `disableMonitoring(): this` | Disable monitoring (the default). Sets `monitoring = false`. |
| `setMonitoringPort(port: number): this` | Enable monitoring on an explicit port. Sets `monitoring = <port>`. |
| `setStartTimeout(ms: number): this` | Set the readiness timeout. Sets `startTimeoutMs`. |

All three monitoring setters write the **same** internal field `monitoring` and obey
**last-call-wins**, e.g. `enableMonitoring().setMonitoringPort(8222)` → port `8222`;
`setMonitoringPort(8222).disableMonitoring()` → disabled.

### Server — `NatsServer`

| Method | Returns | Behavior |
| --- | --- | --- |
| `getMonitoringUrl()` | `string \| undefined` | `http://<host>:<monitorPort>` when monitoring is enabled **and** `start()` has resolved; `undefined` when monitoring is disabled or the server has not started. |

(`getMonitoringPort()` is intentionally omitted for now — YAGNI; can be added later.)

### Config file — `NatsMemoryServerConfig`

New optional runtime fields, honored with the existing precedence
(**defaults < config file < explicit code options**):

- `monitoring?: boolean | number` — `false` (default) / `true` (auto port) / `<port>`.
- `startTimeoutMs?: number`.

## 4. Options & defaults

`NatsServerOptions` ([src/nats-server.ts](../../../src/nats-server.ts)) gains:

- `monitoring: boolean | number` — default `false`.
- `startTimeoutMs: number` — default `30000`.

`DEFAULT_NATS_SERVER_OPTIONS` adds `monitoring: false` and `startTimeoutMs: 30000`.
`pickRuntimeOptions()` is extended to copy `monitoring` and `startTimeoutMs` from a
config file when present (only when defined, matching the existing pattern).

## 5. `start()` control flow

1. Resolve options (defaults < config file < code), as today.
2. Resolve the **client** port: explicit `port` or `await getFreePort()` — unchanged.
   The client-port TOCTOU race is **not** addressed here.
3. Resolve **monitoring**:
   - disabled (`monitoring === false`): no monitoring args; `monitorPort` stays unset.
   - enabled: `monitorPort = (typeof monitoring === 'number' ? monitoring : await getFreePort())`.
4. Build spawn args:
   - disabled: `['--addr', ip, '--port', String(port), ...args]` — **identical to today**.
   - enabled: `['--addr', ip, '--port', String(port), '-m', String(monitorPort), ...args]`
     (`-m` before user `...args` so explicit user args keep precedence).
5. `spawn(binPath, args, { stdio: 'pipe' })`; record `host`, `port`, and `monitorPort`.
   Keep `stdout.resume()` (drain) as today.
6. Arm readiness with a single shared timeout/abort:
   - Create an `AbortController` and an `unref()`'d timer for `startTimeoutMs`.
   - On timer expiry **if not yet ready**: `controller.abort()`, `child.kill()`,
     `this.process = undefined`, `reject(new Error('NATS server did not become ready
     within <ms>ms'))` (include a short buffered stderr tail when available).
   - **Readiness signal:**
     - monitoring **enabled** → `await waitForHealthz(healthzUrl, { signal, intervalMs: 50 })`;
       resolve on first `200`. The stderr scan is **not** used for readiness in this mode
       (still logged when `verbose`).
     - monitoring **disabled** → resolve when a stderr chunk includes `Server is ready`
       (current behavior), now bounded by the timeout.
   - `error` event (spawn failure) → reject if not ready (unchanged).
   - `close` before ready → reject `NATS server exited before becoming ready` (unchanged).
   - **All** settlement paths (resolve, timeout, error, close) `clearTimeout` and
     `controller.abort()` so no timer or poll outlives `start()`.
7. On ready: `resolve(this)` then `this.process?.unref()` (unchanged; the orphan-cleanup
   fix is a separate step).

`healthzUrl` host = `ip === '0.0.0.0' ? '127.0.0.1' : ip` (poll a connectable host when
bound to the wildcard address); port = `monitorPort`; path = `/healthz`.

## 6. New unit: `src/utils/wait-for-healthz.ts`

A small, isolated, independently testable poller — keeps `start()` thin.

```ts
export interface WaitForHealthzOptions {
  intervalMs?: number;   // default 50
  signal?: AbortSignal;  // abort to stop polling (driven by start()'s timeout)
}

// Polls GET <url> using node:http (no proxy — the target is local). Resolves on the
// first 2xx response. Connection-refused / non-2xx / parse errors before readiness are
// swallowed and retried after intervalMs. Rejects only when the signal aborts.
export async function waitForHealthz(
  url: string,
  options?: WaitForHealthzOptions,
): Promise<void>;
```

Uses `node:http` (not `make-fetch-happen`) — the endpoint is always local, so no proxy
handling is needed and no new heavy dependency is pulled onto the start path. Exported
from `src/utils/index.ts`.

## 7. Error handling

- **Timeout:** child killed, `this.process` nulled, reject with a clear message (+ stderr
  tail). No timer or poll leaks past `start()`.
- **healthz polling:** `ECONNREFUSED` / transient errors / non-2xx before ready are
  expected (server still coming up) → retry until the shared timeout aborts.
- **Explicit monitoring port already in use:** `nats-server` exits non-zero before ready
  → caught by the existing `close`-before-ready rejection.

## 8. Backward compatibility

- Monitoring is **off by default**, so spawn args and readiness for existing users are
  unchanged except that `start()` is now bounded by `startTimeoutMs`.
- The existing test asserting exact spawn args `['--addr','127.0.0.1','--port','4222']`
  (`src/nats-server.spec.ts:249-253`) stays valid because monitoring-off appends nothing.

## 9. Testing (TDD)

Deterministic unit tests (mock `child_process.spawn` with a fake child, per the existing
`makeFloodingChild` pattern) plus real-binary integration coverage:

1. **Builder setters** return `this` and are chainable; last-call-wins for
   `enableMonitoring`/`disableMonitoring`/`setMonitoringPort`.
2. **Default (monitoring off):** `getMonitoringUrl()` → `undefined`; start resolves via the
   stderr path; spawn args unchanged (existing flood test continues to pass).
3. **`waitForHealthz` unit:** resolves on a fake local `http` server returning `200` on
   `/healthz`; retries through `ECONNREFUSED`/non-2xx; rejects when its `AbortSignal` aborts.
4. **Monitoring enabled (mocked spawn + fake healthz server on an explicit port):**
   `setMonitoringPort(p)` → `start()` resolves via healthz; `getMonitoringUrl()` ===
   `http://127.0.0.1:p`; spawn args include `-m <p>`.
5. **Monitoring enabled (integration, real binary):** `enableMonitoring()` → `start()`;
   `GET getMonitoringUrl()+'/healthz'` → `200`; pub/sub round-trip works; `stop()`.
6. **Start timeout:** fake child that never signals readiness (no `Server is ready`, and —
   for the monitoring case — no healthz server) → `start()` rejects within
   `startTimeoutMs` (tests use a small value, e.g. 200ms) and the child is killed.
7. **Config file:** `monitoring`/`startTimeoutMs` from a config file are honored; explicit
   code options override the file.

## 10. Files touched

- [src/nats-server.ts](../../../src/nats-server.ts) — options/defaults, `pickRuntimeOptions`,
  `start()` flow, `getMonitoringUrl()`, `monitorPort` field.
- [src/nats-server.builder.ts](../../../src/nats-server.builder.ts) — `enableMonitoring`,
  `disableMonitoring`, `setMonitoringPort`, `setStartTimeout`.
- [src/utils/get-project-config.ts](../../../src/utils/get-project-config.ts) — config type
  fields `monitoring`, `startTimeoutMs`.
- **new** [src/utils/wait-for-healthz.ts](../../../src/utils/wait-for-healthz.ts) + export in
  `src/utils/index.ts`.
- Tests: `src/nats-server.spec.ts`, `src/nats-server.builder.spec.ts`,
  `src/nats-server.project-config.spec.ts`, and a new `src/utils/wait-for-healthz.spec.ts`.
- `README.md` — a short "Monitoring" subsection (`enableMonitoring()` / `getMonitoringUrl()`)
  and a note on `setStartTimeout()`.

## 11. Out of scope (future steps)

- Client-port TOCTOU race (use `--port -1` / `--ports_file_dir` + `/varz`).
- Orphan-process cleanup on abnormal exit (exit/SIGINT/SIGTERM handlers).
- `stop()` timeout + SIGKILL escalation.
- First-class JetStream / cluster / auth / TLS helpers.
