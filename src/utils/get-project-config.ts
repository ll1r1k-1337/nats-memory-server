import path, { isAbsolute } from 'path';
import fs, { promises as fsPromises } from 'fs';
import { type ChecksumMode } from './verify-checksum';

const configKey = `natsMemoryServer` as const;
const configFileBaseName = `nats-memory-server` as const;
const allowedExtensions = [`.ts`, `.js`, `.json`] as const;

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
    return require(filePath);
  },
  '.js': (filePath: string) => require(filePath),
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
    return require(filePath);
  },
  '.js': async (filePath: string) => require(filePath),
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
  if (projectConfigCache.has(projectPath)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await projectConfigCache.get(projectPath)!;
  }

  const configPromise = getProjectConfigUncached(projectPath);
  projectConfigCache.set(projectPath, configPromise);
  return await configPromise;
}
