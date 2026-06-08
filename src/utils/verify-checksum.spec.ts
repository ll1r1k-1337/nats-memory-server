import os from 'os';
import fs from 'fs';
import path from 'path';
import {
  deriveChecksumUrl,
  parseSha256Sums,
  sha256OfFile,
  verifyChecksum,
} from './verify-checksum';

// Known SHA-256 test vector: sha256("abc").
const ABC_SHA = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`;
const RELEASE_URL = `https://github.com/nats-io/nats-server/releases/download/v9.9.9/asset.zip`;

describe(`deriveChecksumUrl`, () => {
  it(`maps a GitHub release asset URL to its SHA256SUMS URL and asset name`, () => {
    const result = deriveChecksumUrl(RELEASE_URL);
    expect(result).toEqual({
      sumsUrl: `https://github.com/nats-io/nats-server/releases/download/v9.9.9/SHA256SUMS`,
      assetName: `asset.zip`,
    });
  });

  it(`returns null for a source-archive (buildFromSource) URL`, () => {
    expect(
      deriveChecksumUrl(
        `https://github.com/nats-io/nats-server/archive/refs/tags/v9.9.9.zip`,
      ),
    ).toBeNull();
  });

  it(`returns null for a non-release / unparseable URL`, () => {
    expect(deriveChecksumUrl(`https://my-mirror.example/nats.zip`)).toBeNull();
    expect(deriveChecksumUrl(`not a url`)).toBeNull();
  });
});

describe(`parseSha256Sums`, () => {
  const sums = [
    `293013cd810f35f2a3dd25b0d850da248bc45af46b854a805383f848db3e9fa0  nats-server-v9.9.9-windows-amd64.zip`,
    `51100105ca16c609ab05a12901f1e61b1d997c4ab80c12d722c6d1c0828ab50e  nats-server-v9.9.9-linux-amd64.zip`,
  ].join(`\n`);

  it(`returns the digest for a matching asset name`, () => {
    expect(parseSha256Sums(sums, `nats-server-v9.9.9-linux-amd64.zip`)).toBe(
      `51100105ca16c609ab05a12901f1e61b1d997c4ab80c12d722c6d1c0828ab50e`,
    );
  });

  it(`supports the binary-mode "*name" form`, () => {
    expect(parseSha256Sums(`${ABC_SHA} *asset.zip`, `asset.zip`)).toBe(ABC_SHA);
  });

  it(`returns null when the asset is absent`, () => {
    expect(
      parseSha256Sums(sums, `nats-server-v9.9.9-darwin-arm64.zip`),
    ).toBeNull();
  });

  it(`returns null for garbage input`, () => {
    expect(parseSha256Sums(`not a checksums file`, `asset.zip`)).toBeNull();
  });
});

describe(`sha256OfFile`, () => {
  it(`computes the streaming SHA-256 of a file`, async () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), `nms-sha-`)),
      `data.bin`,
    );
    fs.writeFileSync(file, `abc`);

    try {
      expect(await sha256OfFile(file)).toBe(ABC_SHA);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

describe(`verifyChecksum`, () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `nms-vc-`));
    file = path.join(dir, `asset.zip`);
    fs.writeFileSync(file, `abc`); // sha256 == ABC_SHA
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const deps = (
    fetchText: jest.Mock,
    warn: jest.Mock = jest.fn(),
  ): { fetchText: jest.Mock; logger: { warn: jest.Mock } } => ({
    fetchText,
    logger: { warn },
  });

  it(`mode "off" skips verification entirely and never fetches`, async () => {
    const fetchText = jest.fn();
    await expect(
      verifyChecksum(file, RELEASE_URL, `off`, {}, deps(fetchText)),
    ).resolves.toBeUndefined();
    expect(fetchText).not.toHaveBeenCalled();
  });

  it(`resolves when the downloaded file matches the published digest`, async () => {
    const fetchText = jest.fn().mockResolvedValue(`${ABC_SHA}  asset.zip`);
    await expect(
      verifyChecksum(file, RELEASE_URL, `warn`, {}, deps(fetchText)),
    ).resolves.toBeUndefined();
    expect(fetchText).toHaveBeenCalledWith(
      `https://github.com/nats-io/nats-server/releases/download/v9.9.9/SHA256SUMS`,
      {},
    );
  });

  it(`rejects on a digest MISMATCH in warn mode (tampering is always fatal)`, async () => {
    const wrong = `0`.repeat(64);
    const fetchText = jest.fn().mockResolvedValue(`${wrong}  asset.zip`);
    await expect(
      verifyChecksum(file, RELEASE_URL, `warn`, {}, deps(fetchText)),
    ).rejects.toThrow(/checksum/i);
  });

  it(`rejects on a digest MISMATCH in strict mode`, async () => {
    const wrong = `0`.repeat(64);
    const fetchText = jest.fn().mockResolvedValue(`${wrong}  asset.zip`);
    await expect(
      verifyChecksum(file, RELEASE_URL, `strict`, {}, deps(fetchText)),
    ).rejects.toThrow(/checksum/i);
  });

  it(`warn mode: warns and continues when no digest is available (custom URL)`, async () => {
    const fetchText = jest.fn();
    const warn = jest.fn();
    await expect(
      verifyChecksum(
        file,
        `https://my-mirror.example/nats.zip`,
        `warn`,
        {},
        deps(fetchText, warn),
      ),
    ).resolves.toBeUndefined();
    expect(fetchText).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it(`strict mode: rejects when no digest is available (custom URL)`, async () => {
    const fetchText = jest.fn();
    await expect(
      verifyChecksum(
        file,
        `https://my-mirror.example/nats.zip`,
        `strict`,
        {},
        deps(fetchText),
      ),
    ).rejects.toThrow();
  });

  it(`warn mode: warns and continues when SHA256SUMS cannot be fetched`, async () => {
    const fetchText = jest.fn().mockRejectedValue(new Error(`network down`));
    const warn = jest.fn();
    await expect(
      verifyChecksum(file, RELEASE_URL, `warn`, {}, deps(fetchText, warn)),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it(`strict mode: rejects when SHA256SUMS cannot be fetched`, async () => {
    const fetchText = jest.fn().mockRejectedValue(new Error(`network down`));
    await expect(
      verifyChecksum(file, RELEASE_URL, `strict`, {}, deps(fetchText)),
    ).rejects.toThrow();
  });

  it(`warn mode: warns and continues when the asset is missing from SHA256SUMS`, async () => {
    const fetchText = jest
      .fn()
      .mockResolvedValue(`${ABC_SHA}  some-other-asset.zip`);
    const warn = jest.fn();
    await expect(
      verifyChecksum(file, RELEASE_URL, `warn`, {}, deps(fetchText, warn)),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
