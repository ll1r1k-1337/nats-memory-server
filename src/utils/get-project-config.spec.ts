import os from 'os';
import fs from 'fs';
import path from 'path';
import { getProjectConfig, readFile } from './get-project-config';

describe(`getProjectConfig`, () => {
  it(`applies a .js config written with module.exports`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));

    try {
      fs.writeFileSync(
        path.join(dir, `nats-memory-server.js`),
        `module.exports = { version: 'v1.1.1-module-exports', download: false };`,
      );

      const config = await getProjectConfig(dir);
      expect(config.version).toBe(`v1.1.1-module-exports`);
      expect(config.download).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`applies a .js config compiled to exports.default with __esModule`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));

    try {
      // The shape tsc emits for `export default {...}` compiled to CommonJS.
      fs.writeFileSync(
        path.join(dir, `nats-memory-server.js`),
        `Object.defineProperty(exports, "__esModule", { value: true });\n` +
          `exports.default = { version: 'v2.2.2-esmodule-default', download: false };`,
      );

      const config = await getProjectConfig(dir);
      expect(config.version).toBe(`v2.2.2-esmodule-default`);
      expect(config.download).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`applies a .ts config written with export default`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));

    try {
      fs.writeFileSync(
        path.join(dir, `nats-memory-server.ts`),
        `export default { version: 'v3.3.3-ts-default', download: false };`,
      );

      const config = await getProjectConfig(dir);
      expect(config.version).toBe(`v3.3.3-ts-default`);
      expect(config.download).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`does not cache a rejected config load and retries once the file is fixed`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));
    const configPath = path.join(dir, `nats-memory-server.json`);

    try {
      // A malformed config makes the first load reject.
      fs.writeFileSync(configPath, `{ not valid json`);

      await expect(getProjectConfig(dir)).rejects.toThrow();

      // The cause is fixed; a subsequent call must retry and succeed rather
      // than re-returning the cached rejection.
      fs.writeFileSync(configPath, JSON.stringify({ version: `v9.9.9-fixed` }));

      const config = await getProjectConfig(dir);
      expect(config.version).toBe(`v9.9.9-fixed`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe(`readFile`, () => {
  it(`unwraps an __esModule default export from a .js config`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));
    const configPath = path.join(dir, `nats-memory-server.js`);

    try {
      fs.writeFileSync(
        configPath,
        `Object.defineProperty(exports, "__esModule", { value: true });\n` +
          `exports.default = { version: 'v4.4.4-sync-default' };`,
      );

      expect(readFile(configPath)).toEqual({ version: `v4.4.4-sync-default` });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`unwraps export default from a .ts config`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));
    const configPath = path.join(dir, `nats-memory-server.ts`);

    try {
      fs.writeFileSync(
        configPath,
        `export default { version: 'v6.6.6-sync-ts-default' };`,
      );

      expect(readFile(configPath)).toEqual({
        version: `v6.6.6-sync-ts-default`,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`returns a module.exports .js config as-is`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));
    const configPath = path.join(dir, `nats-memory-server.js`);

    try {
      fs.writeFileSync(
        configPath,
        `module.exports = { version: 'v5.5.5-sync-module-exports' };`,
      );

      expect(readFile(configPath)).toEqual({
        version: `v5.5.5-sync-module-exports`,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
