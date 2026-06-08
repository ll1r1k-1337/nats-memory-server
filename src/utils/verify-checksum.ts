import crypto from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { type DownloadFileOptions } from './download-file';

export type ChecksumMode = `strict` | `warn` | `off`;

export interface VerifyChecksumDeps {
  fetchText: (url: string, options: DownloadFileOptions) => Promise<string>;
  logger?: { warn: (message: string, ...args: unknown[]) => void };
}

const SUMS_FILE_NAME = `SHA256SUMS`;
const RELEASE_MARKER = `/releases/download/`;

/**
 * For a GitHub release asset URL
 * (`.../releases/download/<tag>/<asset>`), returns the sibling `SHA256SUMS`
 * URL and the asset's filename. Returns `null` for anything else — a source
 * archive (`/archive/refs/tags/...`), a custom mirror, or an unparseable URL —
 * which the caller treats as "no digest available".
 */
export function deriveChecksumUrl(
  downloadUrl: string,
): { sumsUrl: string; assetName: string } | null {
  let url: URL;
  try {
    url = new URL(downloadUrl);
  } catch {
    return null;
  }

  if (!url.pathname.includes(RELEASE_MARKER)) {
    return null;
  }

  const segments = url.pathname.split(`/`);
  const assetName = segments[segments.length - 1];

  if (assetName === ``) {
    return null;
  }

  url.pathname = [...segments.slice(0, -1), SUMS_FILE_NAME].join(`/`);

  return { sumsUrl: url.toString(), assetName };
}

/**
 * Parses a `sha256sum`-style file and returns the lowercase hex digest for
 * `assetName`, or `null` if it is not listed. Accepts both the text-mode
 * (`<hex>  name`) and binary-mode (`<hex> *name`) separators.
 */
export function parseSha256Sums(
  text: string,
  assetName: string,
): string | null {
  for (const line of text.split(`\n`)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);

    if (match != null && match[2].trim() === assetName) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

/** Streams a file through SHA-256 and returns the lowercase hex digest. */
export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash(`sha256`);
  await pipeline(createReadStream(filePath), hash);
  return hash.digest(`hex`);
}

/**
 * Verifies `filePath` against the digest published in the release's
 * `SHA256SUMS`, per `mode`:
 *  - `off`    — no verification.
 *  - `warn`   — a detected mismatch aborts; an *unavailable* digest only warns.
 *  - `strict` — a mismatch OR an unavailable digest aborts.
 *
 * A positive mismatch is always fatal (except in `off`): it signals corruption
 * or tampering, so the downloaded archive must not be used.
 */
export async function verifyChecksum(
  filePath: string,
  downloadUrl: string,
  mode: ChecksumMode,
  options: DownloadFileOptions,
  deps: VerifyChecksumDeps,
): Promise<void> {
  if (mode === `off`) {
    return;
  }

  const unavailable = (reason: string): void => {
    const message = `Could not verify the integrity of ${downloadUrl}: ${reason}`;

    if (mode === `strict`) {
      throw new Error(
        `${message}. Aborting because verifyChecksum is "strict" (set it to "warn" or "off" to relax).`,
      );
    }

    deps.logger?.warn(
      `${message}. Continuing because verifyChecksum is "warn".`,
    );
  };

  const derived = deriveChecksumUrl(downloadUrl);

  if (derived === null) {
    unavailable(`no SHA256SUMS could be located for this URL`);
    return;
  }

  let sumsText: string;
  try {
    sumsText = await deps.fetchText(derived.sumsUrl, options);
  } catch (error) {
    unavailable(
      `failed to download ${derived.sumsUrl} (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return;
  }

  const expected = parseSha256Sums(sumsText, derived.assetName);

  if (expected === null) {
    unavailable(`${derived.assetName} is not listed in SHA256SUMS`);
    return;
  }

  const actual = await sha256OfFile(filePath);

  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${derived.assetName}: expected ${expected}, got ${actual}. ` +
        `The download may be corrupted or tampered with; refusing to use it.`,
    );
  }
}
