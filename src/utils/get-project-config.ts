import path, { isAbsolute } from 'path';
import fs, { promises as fsPromises } from 'fs';
import { type ChecksumMode } from './verify-checksum';

const configKey = `natsMemoryServer` as const;
const configFileBaseName = `nats-memory-server` as const;
const allowedExtensions = [`.ts`, `.js`, `.json`] as const;

// Configs authored as ES modules (`export default {...}`) are compiled to
// CommonJS as `{ __esModule: true, default: {...} }`; unwrap the default
// export so the actual config fields get merged, not the interop wrapper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapDefaultExport(mod: any): any {
  if (
    mod !== null &&
    typeof mod === `object` &&
    mod.__esModule === true &&
    mod.default !== undefined
  ) {
    return mod.default;
  }
  return mod;
}

const readFileMap = {
  '.ts': (filePath: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tsNode: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/quotes
      tsNode = require('ts-node');
    } catch {
      throw new Error(`ts-node is not installed`);
    }

    tsNode.register();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return unwrapDefaultExport(require(filePath));
  },
  '.js': (filePath: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    unwrapDefaultExport(require(filePath)),
  '.json': (filePath: string) => JSON.parse(fs.readFileSync(filePath, `utf8`)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<(typeof allowedExtensions)[number], (path: string) => any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readFile(filePath: string): any {
  const ext = path.extname(filePath).toLowerCase();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  return readFileMap[ext](filePath);
}

const readFileAsyncMap = {
  '.ts': async (filePath: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tsNode: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/quotes
      tsNode = require('ts-node');
    } catch {
      throw new Error(`ts-node is not installed`);
    }

    tsNode.register();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return unwrapDefaultExport(require(filePath));
  },
  '.js': async (filePath: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    unwrapDefaultExport(require(filePath)),
  '.json': async (filePath: string) =>
    JSON.parse(await fsPromises.readFile(filePath, `utf8`)),
} satisfies Record<
  (typeof allowedExtensions)[number],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (path: string) => Promise<any>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readFileAsync(filePath: string): Promise<any> {
  const ext = path.extname(filePath).toLowerCase();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  return readFileAsyncMap[ext](filePath);
}

export interface NatsMemoryServerConfig {
  download: boolean;
  downloadDir: string;
  version: string;
  buildFromSource: boolean;
  binPath: string;
  downloadUrl?: string;
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
  /** Integrity check for the downloaded archive. Default: `warn`. */
  verifyChecksum?: ChecksumMode;
  /** Runtime: port the server listens on. Default: a random free port. */
  port?: number;
  /** Runtime: bind address. Default: `127.0.0.1`. */
  ip?: string;
  /** Runtime: verbose logging. Default: `true`. */
  verbose?: boolean;
  /** Runtime: extra CLI arguments passed to `nats-server`. Default: `[]`. */
  args?: string[];
}

const defaultConfig: NatsMemoryServerConfig = {
  download: true,
  downloadDir: `node_modules/.cache/nats-memory-server`,
  version: `v2.9.16`,
  buildFromSource: false,
  binPath: `node_modules/.cache/nats-memory-server/nats-server`,
  verifyChecksum: `warn`,
};

function prepareConfig(
  config: NatsMemoryServerConfig,
  projectPath: string,
): NatsMemoryServerConfig {
  let downloadDir = config.downloadDir;
  let binPath = config.binPath;

  if (!isAbsolute(config.downloadDir)) {
    downloadDir = path.resolve(projectPath, config.downloadDir);
  }

  if (!isAbsolute(config.binPath)) {
    binPath = path.resolve(projectPath, config.binPath);
  }
  return {
    ...config,
    downloadDir,
    binPath,
  };
}

const projectConfigCache = new Map<string, Promise<NatsMemoryServerConfig>>();

async function getProjectConfigUncached(
  projectPath: string,
): Promise<NatsMemoryServerConfig> {
  const possibleConfigPaths = allowedExtensions.map((ext) =>
    path.resolve(projectPath, `./${configFileBaseName}${ext}`),
  );

  const existenceChecks = await Promise.all(
    possibleConfigPaths.map(async (p) => {
      try {
        await fsPromises.access(p);
        return true;
      } catch {
        return false;
      }
    }),
  );

  const foundIndex = existenceChecks.findIndex((exists) => exists);
  const projectConfigPath =
    foundIndex >= 0 ? possibleConfigPaths[foundIndex] : undefined;

  const packageJsonPath = path.resolve(projectPath, `./package.json`);

  let config: NatsMemoryServerConfig;

  if (projectConfigPath !== undefined) {
    config = {
      ...defaultConfig,
      ...(await readFileAsync(projectConfigPath)),
    };
  } else {
    let packageJsonExists = false;
    try {
      await fsPromises.access(packageJsonPath);
      packageJsonExists = true;
    } catch {
      packageJsonExists = false;
    }

    if (packageJsonExists) {
      config = {
        ...defaultConfig,
        ...(await readFileAsync(packageJsonPath))[configKey],
      };
    } else {
      config = defaultConfig;
    }
  }

  return prepareConfig(config, projectPath);
}

export async function getProjectConfig(
  projectPath: string,
): Promise<NatsMemoryServerConfig> {
  const cached = projectConfigCache.get(projectPath);
  if (cached !== undefined) {
    return await cached;
  }

  const configPromise = getProjectConfigUncached(projectPath);
  // Do not cache a rejection: evict the entry on failure so a later call can
  // retry once the underlying cause (a transient fs error, a malformed config
  // file, ts-node not yet installed, ...) is resolved, instead of re-rejecting
  // with the original error for the rest of the process lifetime.
  void configPromise.catch(() => {
    projectConfigCache.delete(projectPath);
  });
  projectConfigCache.set(projectPath, configPromise);
  return await configPromise;
}
