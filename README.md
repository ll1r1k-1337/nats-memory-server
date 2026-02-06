# NATS In-Memory Server

[![GitHub license](https://img.shields.io/github/license/Llirik1337/nats-memory-server)](https://github.com/Llirik1337/nats-memory-server/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/Llirik1337/nats-memory-server)](https://github.com/Llirik1337/nats-memory-server/issues)
[![GitHub stars](https://img.shields.io/github/stars/Llirik1337/nats-memory-server)](https://github.com/Llirik1337/nats-memory-server/stargazers)


## Table of Contents
1. [Description](#description)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Usage](#usage)
5. [Configuration](#configuration)
6. [API Reference](#api-reference)
7. [NATS Jetstream](#nats-jetstream)
8. [Contributing](#contributing)


# Description

`nats-memory-server` is a Node.js package that provides an in-memory NATS server for testing and other purposes. It allows you to quickly set up and tear down a NATS server instance within your Node.js applications, making it easier to write tests and perform other operations that require a NATS server.

## Requirements

- [Go](https://golang.org/) (Optional. Only if you build from source) (version 1.19 or later)

## Installation

You can install `nats-memory-server` using npm or yarn:

```bash
npm install nats-memory-server
```

or

```bash
yarn add nats-memory-server
```

## Usage

Here is a basic example of how to start and stop the NATS server using `nats-memory-server` and connect to it using the `nats` client.

```javascript
const { NatsServerBuilder } = require('nats-memory-server');
const { connect, StringCodec } = require('nats');

(async () => {
  // Start the server
  // This will try to find a free port automatically if not specified
  const server = await NatsServerBuilder.create().build().start();

  const url = server.getUrl();
  console.log(`NATS server started at ${url}`);

  try {
    // Connect to the server
    const nc = await connect({ servers: url });

    // Example: Publish and Subscribe
    const sc = StringCodec();
    const sub = nc.subscribe("hello");

    (async () => {
      for await (const m of sub) {
        console.log(`[${sub.getProcessed()}]: ${sc.decode(m.data)}`);
      }
    })();

    nc.publish("hello", sc.encode("world"));

    // Ensure all messages are processed
    await nc.drain();
  } catch (err) {
    console.error(err);
  } finally {
    // Stop the server
    await server.stop();
  }
})();
```

For a runnable example, check [example.js](https://github.com/Llirik1337/nats-memory-server/blob/main/example.js).

## Configuration

The configuration is used for two purposes:
1. **Installation**: Determining which NATS server binary to download or build (handled during `postinstall`).
2. **Runtime**: Configuring the server instance (port, ip, args, etc.).

You can configure the library using one of the following files:
- `nats-memory-server.json`
- `nats-memory-server.js`
- `nats-memory-server.ts`
- `package.json` (under `natsMemoryServer` key)

### Default Configuration

```json
{
  "download": true,
  "downloadDir": "node_modules/.cache/nats-memory-server",
  "version": "v2.9.16",
  "buildFromSource": false,
  "binPath": "node_modules/.cache/nats-memory-server/nats-server",
  "verbose": true,
  "ip": "0.0.0.0"
}
```

### Configuration Options

**Installation Options:**
- `download`: (boolean) Whether to download the binary. Default: `true`.
- `downloadDir`: (string) Directory to download the binary to.
- `version`: (string) NATS server version to download. Default: `v2.9.16`.
- `buildFromSource`: (boolean) Whether to build from source instead of downloading. Default: `false`.
- `binPath`: (string) Path to the NATS server binary.

**Runtime Options:**
- `port`: (number) Port to listen on. If not specified, a free port is chosen.
- `ip`: (string) IP address to bind to. Default: `0.0.0.0`.
- `verbose`: (boolean) Enable verbose logging. Default: `true`.
- `args`: (string[]) Additional arguments to pass to the NATS server.

### Example `nats-memory-server.json`

```json
{
  "version": "v2.9.16",
  "verbose": false,
  "port": 4222
}
```

### Configuration in `package.json`

```json
{
  "natsMemoryServer": {
    "version": "v2.9.16",
    "port": 4222
  }
}
```

## API Reference

### `NatsServerBuilder`

The builder class for creating `NatsServer` instances.

#### `static create(options?: Partial<NatsServerOptions>)`
Creates a new `NatsServerBuilder` instance.

#### `setPort(port: number): this`
Sets the port number for the server.

#### `setIp(ip: string): this`
Sets the IP address to bind to.

#### `setVerbose(verbose: boolean): this`
Enables or disables verbose logging.

#### `setArgs(args: string[]): this`
Sets additional arguments for the NATS server executable.

#### `setBinPath(binPath: string): this`
Sets the path to the NATS server binary.

#### `setLogger(logger: Logger): this`
Sets a custom logger. The logger must implement `log`, `error`, `warn`, and `debug` methods.

#### `build(): NatsServer`
Builds and returns a `NatsServer` instance.

### `NatsServer`

The NATS server instance.

#### `start(): Promise<this>`
Starts the NATS server. Returns a promise that resolves to the server instance when ready.

#### `stop(): Promise<void>`
Stops the NATS server.

#### `getUrl(): string`
Returns the connection URL (e.g., `nats://0.0.0.0:4222`).

#### `getHost(): string`
Returns the host.

#### `getPort(): number`
Returns the port.

## NATS Jetstream

To enable JetStream, you can use `setArgs` in the builder or pass it in the constructor options.

Using Builder:
```ts
const os = require('os');
const { NatsServerBuilder } = require('nats-memory-server');

await NatsServerBuilder
      .create()
      .setArgs(['--jetstream', '--store_dir', os.tmpdir()])
      .build()
      .start();
```

Using Constructor:
```ts
const os = require('os');
const { NatsServer, DEFAULT_NATS_SERVER_OPTIONS } = require('nats-memory-server');

new NatsServer({
  ...DEFAULT_NATS_SERVER_OPTIONS,
  args: ['--jetstream', '--store_dir', os.tmpdir()],
});
```

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvement, please feel free to open an issue or submit a pull request on the [GitHub repository](https://github.com/Llirik1337/nats-memory-server).

When contributing, please ensure to follow the [code of conduct](https://github.com/Llirik1337/nats-memory-server/blob/main/CODE_OF_CONDUCT.md).
