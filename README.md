<div align="center">

# 🧪 NATS In-Memory Server

### Spin up a **real** [NATS](https://nats.io/) server in milliseconds — for tests, local dev, and CI.

Like [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server), but for NATS.
It downloads the official `nats-server` binary once, runs it on a random free port, and tears it
down cleanly when you're done.

[![tests](https://img.shields.io/github/actions/workflow/status/ll1r1k-1337/nats-memory-server/test.yml?branch=main&logo=github&label=tests)](https://github.com/ll1r1k-1337/nats-memory-server/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/nats-memory-server?color=cb3837&logo=npm)](https://www.npmjs.com/package/nats-memory-server)
[![downloads](https://img.shields.io/npm/dm/nats-memory-server?color=cb3837&logo=npm)](https://www.npmjs.com/package/nats-memory-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![license](https://img.shields.io/github/license/Llirik1337/nats-memory-server?color=blue)](https://github.com/Llirik1337/nats-memory-server/blob/main/LICENSE)
[![stars](https://img.shields.io/github/stars/Llirik1337/nats-memory-server?style=social)](https://github.com/Llirik1337/nats-memory-server/stargazers)

</div>

---

## ✨ Features

- 🚀 **Zero config** — `create().build().start()` and you have a live server
- 🎯 **The real thing** — runs the official `nats-server` binary, not a mock
- 🔌 **Auto free port** — no collisions when test suites run in parallel
- 🔒 **Checksum-verified downloads** — the binary is checked against the release `SHA256SUMS`
- 🧰 **Fluent builder** with full **TypeScript** types
- 🌊 **JetStream** ready
- 🌐 **Proxy aware** — `httpProxy` / `httpsProxy` / `noProxy`
- 🧹 **Clean teardown** — `stop()` and the process is gone

---

## 📦 Installation

```bash
npm install nats-memory-server
# or
yarn add nats-memory-server
```

> The official `nats-server` binary is downloaded automatically on `postinstall`.

---

## ⚡ Quick Start

```javascript
const { NatsServerBuilder } = require('nats-memory-server');
const { connect } = require('nats');

// Starts on a random free port and resolves once the server is ready
const server = await NatsServerBuilder.create().build().start();

const nc = await connect({ servers: server.getUrl() });
// ... publish / subscribe ...
await nc.close();

await server.stop();
```

---

## 📖 Usage

A fuller publish/subscribe round-trip:

```javascript
const { NatsServerBuilder } = require('nats-memory-server');
const { connect, StringCodec } = require('nats');

(async () => {
  // Start the server (a free port is picked automatically if none is set)
  const server = await NatsServerBuilder.create().build().start();
  console.log(`NATS server started at ${server.getUrl()}`);

  try {
    const nc = await connect({ servers: server.getUrl() });
    const sc = StringCodec();

    const sub = nc.subscribe('hello');
    (async () => {
      for await (const m of sub) {
        console.log(`[${sub.getProcessed()}]: ${sc.decode(m.data)}`);
      }
    })();

    nc.publish('hello', sc.encode('world'));

    await nc.drain(); // flush in-flight messages, then close
  } catch (err) {
    console.error(err);
  } finally {
    await server.stop();
  }
})();
```

> 💡 Runnable version: [example.js](https://github.com/Llirik1337/nats-memory-server/blob/main/example.js).

---

## ⚙️ Configuration

Configuration drives two things:

1. **Installation** — which `nats-server` binary to download or build (during `postinstall`).
2. **Runtime** — how the server instance behaves (`port`, `ip`, `args`, …).

Provide it via any of: `nats-memory-server.json` · `nats-memory-server.js` · `nats-memory-server.ts` · the `natsMemoryServer` key in `package.json`.

### Installation options

| Option            | Type                          | Default                                       | Description                                                        |
| ----------------- | ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `download`        | `boolean`                     | `true`                                        | Download the binary during `postinstall`.                          |
| `downloadDir`     | `string`                      | `node_modules/.cache/nats-memory-server`      | Where the downloaded binary is cached.                             |
| `version`         | `string`                      | `v2.9.16`                                     | `nats-server` version to download.                                 |
| `buildFromSource` | `boolean`                     | `false`                                       | Build from source instead of downloading (requires Go).            |
| `binPath`         | `string`                      | *(cache path above)*                          | Path to the `nats-server` binary.                                  |
| `httpProxy`       | `string`                      | –                                             | Proxy URL for HTTP requests.                                       |
| `httpsProxy`      | `string`                      | –                                             | Proxy URL for HTTPS requests.                                      |
| `noProxy`         | `string`                      | –                                             | Domains that bypass the proxy.                                     |
| `verifyChecksum`  | `'strict' \| 'warn' \| 'off'` | `warn`                                        | Integrity-check the download against the release `SHA256SUMS`.     |

> 🔒 **`verifyChecksum`** — a checksum **mismatch always aborts** the install (only `off` skips the check entirely).
> `warn` (default) additionally just *warns* when a checksum can't be obtained (custom `downloadUrl`, `buildFromSource`,
> or an unreachable `SHA256SUMS`); `strict` aborts in that case too.

### Runtime options

| Option    | Type       | Default               | Description                                                                              |
| --------- | ---------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `port`    | `number`   | *(random free port)*  | Port to listen on.                                                                       |
| `ip`      | `string`   | `127.0.0.1`           | Bind address. Use `0.0.0.0` to expose on all interfaces — ⚠️ the broker has no auth.     |
| `verbose` | `boolean`  | `true`                | Verbose logging.                                                                         |
| `args`    | `string[]` | `[]`                  | Extra arguments passed straight to `nats-server`.                                        |

<details>
<summary><b>Example config files</b></summary>

`nats-memory-server.json`

```json
{
  "version": "v2.9.16",
  "verbose": false,
  "port": 4222
}
```

In `package.json`

```json
{
  "natsMemoryServer": {
    "version": "v2.9.16",
    "port": 4222
  }
}
```

Full default configuration

```json
{
  "download": true,
  "downloadDir": "node_modules/.cache/nats-memory-server",
  "version": "v2.9.16",
  "buildFromSource": false,
  "binPath": "node_modules/.cache/nats-memory-server/nats-server",
  "verifyChecksum": "warn",
  "verbose": true,
  "ip": "127.0.0.1"
}
```

</details>

---

## 📚 API Reference

### `NatsServerBuilder`

Fluent builder for `NatsServer` instances — every setter returns `this`, so calls chain.

| Method                                | Description                                                         |
| ------------------------------------- | ------------------------------------------------------------------ |
| `static create(options?)`             | Create a new builder, optionally seeded with partial options.      |
| `setPort(port: number)`               | Set the listen port.                                               |
| `setIp(ip: string)`                   | Set the bind address.                                              |
| `setVerbose(verbose: boolean)`        | Toggle verbose logging.                                            |
| `setArgs(args: string[])`             | Set extra `nats-server` arguments.                                 |
| `setBinPath(binPath: string)`         | Set the path to the `nats-server` binary.                          |
| `setLogger(logger: Logger)`           | Provide a custom logger (`log`, `error`, `warn`, `debug`).         |
| `build()`                             | Build and return a `NatsServer`.                                   |

### `NatsServer`

| Method      | Returns         | Description                                                            |
| ----------- | --------------- | --------------------------------------------------------------------- |
| `start()`   | `Promise<this>` | Start the server; resolves once it is ready (rejects if it can't).    |
| `stop()`    | `Promise<void>` | Stop the server.                                                      |
| `getUrl()`  | `string`        | Connection URL, e.g. `nats://127.0.0.1:4222`.                         |
| `getHost()` | `string`        | The bind host.                                                        |
| `getPort()` | `number`        | The listen port.                                                      |

---

## 🌊 JetStream

Enable JetStream with `setArgs` (or constructor options):

```ts
const os = require('os');
const { NatsServerBuilder } = require('nats-memory-server');

await NatsServerBuilder.create()
  .setArgs(['--jetstream', '--store_dir', os.tmpdir()])
  .build()
  .start();
```

<details>
<summary>Using the constructor directly</summary>

```ts
const os = require('os');
const { NatsServer, DEFAULT_NATS_SERVER_OPTIONS } = require('nats-memory-server');

new NatsServer({
  ...DEFAULT_NATS_SERVER_OPTIONS,
  args: ['--jetstream', '--store_dir', os.tmpdir()],
});
```

</details>

---

## 🧪 Testing with Jest

Spin up one server per suite — start it in `beforeAll`, tear it down in `afterAll`:

```javascript
const { NatsServerBuilder } = require('nats-memory-server');
const { connect } = require('nats');

let server;
let nc;

beforeAll(async () => {
  server = await NatsServerBuilder.create().build().start();
  nc = await connect({ servers: server.getUrl() });
});

afterAll(async () => {
  await nc.close();
  await server.stop();
});

test('should publish and subscribe', async () => {
  // your test logic here
});
```

---

## 📋 Requirements

- **Node.js** ≥ 18
- **[Go](https://golang.org/)** ≥ 1.19 — *optional*, only needed when `buildFromSource` is enabled

---

## 🤝 Contributing

Contributions are welcome! Found a bug or have an idea? Open an
[issue](https://github.com/Llirik1337/nats-memory-server/issues) or a pull request.

Please follow the [Code of Conduct](https://github.com/Llirik1337/nats-memory-server/blob/main/CODE_OF_CONDUCT.md).

---

## 📄 License

[MIT](https://github.com/Llirik1337/nats-memory-server/blob/main/LICENSE) © [Llirik1337](https://github.com/Llirik1337)
