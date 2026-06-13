import os from 'os';
import fs from 'fs';
import path from 'path';
import { ensureBinary, type EnsureBinaryConfig } from './ensure-binary';
import { BinaryNotFoundError } from '../errors';

const baseConfig = (
  overrides: Partial<EnsureBinaryConfig> = {},
): EnsureBinaryConfig => ({
  download: false,
  downloadDir: path.join(os.tmpdir(), `nms-ensure-dl`),
  version: `v2.9.16`,
  buildFromSource: false,
  verifyChecksum: `warn`,
  ...overrides,
});

describe(`ensureBinary`, () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-ensure-`));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it(`throws BinaryNotFoundError when no binPath can be resolved`, async () => {
    await expect(
      ensureBinary(baseConfig({ binPath: undefined })),
    ).rejects.toBeInstanceOf(BinaryNotFoundError);

    await expect(
      ensureBinary(baseConfig({ binPath: undefined })),
    ).rejects.toThrow(/binPath/);
  });

  it(`returns the binPath immediately when the binary already exists`, async () => {
    const binPath = path.join(dir, `nats-server`);
    fs.writeFileSync(binPath, `#!/bin/sh\n`);

    await expect(ensureBinary(baseConfig({ binPath }))).resolves.toBe(binPath);
  });

  it(`throws BinaryNotFoundError when the binary is missing and download is disabled`, async () => {
    const binPath = path.join(dir, `does-not-exist`);

    const error = await ensureBinary(
      baseConfig({ binPath, download: false }),
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BinaryNotFoundError);
    expect((error as BinaryNotFoundError).binPath).toBe(binPath);
  });
});
