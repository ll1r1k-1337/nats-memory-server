import os from 'os';
import fs from 'fs';
import path from 'path';
import { getProjectConfig } from './get-project-config';

describe(`getProjectConfig`, () => {
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

  it(`passes runtime options from a config file through, typed`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-cfg-`));
    const configPath = path.join(dir, `nats-memory-server.json`);

    try {
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          verbose: false,
          port: 43333,
          ip: `0.0.0.0`,
          args: [`--jetstream`],
        }),
      );

      const config = await getProjectConfig(dir);

      expect(config.verbose).toBe(false);
      expect(config.port).toBe(43333);
      expect(config.ip).toBe(`0.0.0.0`);
      expect(config.args).toEqual([`--jetstream`]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
