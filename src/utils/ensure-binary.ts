import decompress from 'decompress';
import fs from 'fs';
import os from 'os';
import path from 'path';
import child_process from 'child_process';
import { downloadFile, fetchText } from './download-file';
import { getUrl } from './get-url';
import { getPlatform } from './get-platform';
import { getArch } from './get-arch';
import { verifyChecksum } from './verify-checksum';
import { withRetry } from './with-retry';
import { type NatsMemoryServerConfig } from './get-project-config';
import { BinaryNotFoundError } from '../errors';

/**
 * The subset of {@link NatsMemoryServerConfig} that obtaining the binary needs.
 * `binPath` is widened to optional because the runtime caller (`NatsServer`)
 * merges user options that may explicitly clear it.
 */
export type EnsureBinaryConfig = Omit<NatsMemoryServerConfig, `binPath`> & {
  binPath?: string;
};

/** Minimal logger surface used by the install steps. `console` satisfies it. */
export interface InstallLogger {
  log: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

const noopLogger: InstallLogger = {
  log: () => undefined,
  warn: () => undefined,
};

/**
 * Downloads and extracts the official nats-server release archive into
 * `config.downloadDir`. Pure action: the decision of *whether* to download
 * lives in the callers. Reuses {@link downloadFile}, {@link verifyChecksum} and
 * {@link withRetry}; the decompress step doubles as the integrity check, so a
 * truncated archive throws and triggers a fresh download.
 */
export async function downloadNatsServerBinary(
  config: EnsureBinaryConfig,
  logger: InstallLogger = console,
): Promise<void> {
  const {
    downloadDir,
    version,
    buildFromSource,
    downloadUrl = getUrl(version, getPlatform(), getArch(), buildFromSource),
    httpProxy,
    httpsProxy,
    noProxy,
    verifyChecksum: verifyChecksumMode = `warn`,
  } = config;

  logger.log(`NATS server start download!`);

  await withRetry(
    async () => {
      // Clear any partial state left behind by a previous failed attempt
      // before downloading and extracting again.
      fs.rmSync(downloadDir, { recursive: true, force: true });

      const filePath = await downloadFile(downloadUrl, os.tmpdir(), {
        httpProxy,
        httpsProxy,
        noProxy,
      });

      logger.log(`Downloaded was successful`);

      // Verify the archive against the release's published SHA256SUMS before
      // extracting/executing it. Skipped for buildFromSource (a source
      // tarball, not a checksummed release asset).
      if (!buildFromSource) {
        await verifyChecksum(
          filePath,
          downloadUrl,
          verifyChecksumMode,
          { httpProxy, httpsProxy, noProxy },
          { fetchText, logger },
        );
      }

      await decompress(filePath, downloadDir, { strip: 1 });

      logger.log(`Decompress was successful sources`);
    },
    {
      onRetry: (error, attempt) => {
        logger.log(
          `NATS server download/extract failed (${
            error instanceof Error ? error.message : String(error)
          }). Retrying (attempt ${attempt})...`,
        );
      },
    },
  );
}

/**
 * Builds the nats-server binary from the extracted source tree with `go build`.
 * No-op unless `config.buildFromSource` is set and the binary is not already
 * present.
 */
export async function buildNatsServerFromSource(
  config: EnsureBinaryConfig,
  logger: InstallLogger = console,
): Promise<void> {
  const { buildFromSource, downloadDir, binPath } = config;

  if (!buildFromSource) {
    return;
  }

  if (binPath != null && fs.existsSync(binPath)) {
    return;
  }

  logger.log(`Build sources NATS server`);

  await new Promise<void>((resolve, reject) => {
    const goBuild = child_process.spawn(`go`, [`build`], {
      cwd: downloadDir,
      stdio: `pipe`,
    });

    goBuild.once(`error`, (err) => {
      goBuild.kill();
      reject(err);
    });

    goBuild.on(`spawn`, () => {
      logger.log(`NATS server start building!`);
    });

    goBuild.stdout.on(`data`, (data) => {
      logger.log(String(data));
    });

    goBuild.stderr.on(`data`, (data) => {
      logger.log(String(data));
    });

    goBuild.on(`close`, (code, signal) => {
      // Only report success once we know the build actually succeeded, and
      // reject with a real Error (a bare reject() surfaces as `undefined`,
      // which is useless when the install fails). `code` is null exactly
      // when the child was terminated by a signal, so name the signal then.
      if (code === 0) {
        logger.log(`NATS server was builded successful!`);
        resolve();
      } else {
        reject(
          new Error(
            code === null
              ? `go build was terminated by signal ${signal ?? `unknown`}`
              : `go build exited with a non-zero code (${code})`,
          ),
        );
      }
    });
  });
}

const delay = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const LOCK_STALE_MS = 60_000;
const LOCK_POLL_MS = 200;

/**
 * Runs `fn` while holding an exclusive on-disk lock derived from `targetDir`.
 * `fs.mkdirSync` is atomic and fails with EEXIST when the lock is already held,
 * so two processes (e.g. parallel Jest workers) cannot race the rmSync +
 * re-extract of the download directory. A lock older than {@link LOCK_STALE_MS}
 * is assumed orphaned (the holder crashed) and stolen.
 */
async function withDirectoryLock<T>(
  targetDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockDir = `${targetDir}.lock`;
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });

  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== `EEXIST`) {
        throw error;
      }

      let ageMs = Infinity;
      try {
        ageMs = Date.now() - fs.statSync(lockDir).mtimeMs;
      } catch {
        // The lock vanished between mkdir and stat; loop and try to acquire.
        continue;
      }

      if (ageMs > LOCK_STALE_MS) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - start > LOCK_STALE_MS) {
        throw new Error(
          `Timed out waiting for the NATS server download lock at ${lockDir}`,
        );
      }

      await delay(LOCK_POLL_MS);
    }
  }

  try {
    return await fn();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

// Single-flight per resolved binPath: concurrent start() calls in one process
// share one download instead of clobbering each other. The entry is dropped on
// settle (success or failure) so a later call can retry — mirroring the
// non-caching-rejection policy in getProjectConfig.
const inFlight = new Map<string, Promise<string>>();

async function obtainBinary(
  config: EnsureBinaryConfig,
  binPath: string,
  logger: InstallLogger,
): Promise<string> {
  if (!config.download) {
    throw new BinaryNotFoundError(
      `NATS server binary not found at ${binPath} and download is disabled. ` +
        `Install it manually, set "download": true, or point "binPath" at an existing binary.`,
      binPath,
    );
  }

  await withDirectoryLock(config.downloadDir, async () => {
    // Another process may have finished the download while we waited for the
    // lock — re-check before redoing the work.
    if (fs.existsSync(binPath)) {
      return;
    }

    await downloadNatsServerBinary(config, logger);
    await buildNatsServerFromSource(config, logger);
  });

  if (!fs.existsSync(binPath)) {
    throw new BinaryNotFoundError(
      `NATS server binary still not found at ${binPath} after download. ` +
        `Check the configured "binPath", "downloadDir" and "version".`,
      binPath,
    );
  }

  return binPath;
}

/**
 * Resolves to a path to a usable nats-server binary, downloading (and, when
 * `buildFromSource` is set, building) it on demand if it is not already on
 * disk. The fast path is a single `fs.existsSync`, so repeated `start()` calls
 * stay cheap.
 *
 * @throws {@link BinaryNotFoundError} when no `binPath` can be resolved, when
 * `download` is disabled and the binary is absent, or when the download
 * completes without producing the expected binary.
 */
export async function ensureBinary(
  config: EnsureBinaryConfig,
  logger: InstallLogger = noopLogger,
): Promise<string> {
  const { binPath } = config;

  if (binPath == null) {
    throw new BinaryNotFoundError(
      `Could not resolve a binPath for the NATS server binary`,
    );
  }

  if (fs.existsSync(binPath)) {
    return binPath;
  }

  let pending = inFlight.get(binPath);
  if (pending === undefined) {
    pending = obtainBinary(config, binPath, logger).finally(() => {
      inFlight.delete(binPath);
    });
    inFlight.set(binPath, pending);
  }

  return await pending;
}
