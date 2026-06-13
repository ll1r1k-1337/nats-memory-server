import { createWriteStream } from 'fs';
import path from 'path';
import fetch from 'make-fetch-happen';
import { pipeline } from 'stream/promises';

const CONTENT_DISPOSITION_KEY = `content-disposition`;

export interface DownloadFileOptions {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
}

interface FetchProxyOptions {
  proxy?: string;
  noProxy?: string;
}

function buildFetchOptions(
  url: string,
  options: DownloadFileOptions,
): FetchProxyOptions {
  const proxy = url.startsWith(`https:`)
    ? options.httpsProxy
    : options.httpProxy;

  const fetchOptions: FetchProxyOptions = {};

  if (proxy != null) {
    fetchOptions.proxy = proxy;
  }
  if (options.noProxy != null) {
    fetchOptions.noProxy = options.noProxy;
  }

  return fetchOptions;
}

/** Fetches a small text resource (e.g. a SHA256SUMS file) with the same proxy
 * handling as {@link downloadFile}. */
export async function fetchText(
  url: string,
  options: DownloadFileOptions = {},
): Promise<string> {
  const response = await fetch(url, buildFetchOptions(url, options));

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }

  return await response.text();
}

export async function downloadFile(
  url: string,
  dir = `./`,
  options: DownloadFileOptions = {},
): Promise<string> {
  const response = await fetch(url, buildFetchOptions(url, options));

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  const contentDisposition = response.headers.get(CONTENT_DISPOSITION_KEY);
  let fileName: string | undefined;

  if (contentDisposition != null) {
    const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i.exec(
      contentDisposition,
    );
    if (match?.[1] != null) {
      fileName = match[1].replace(/^(['"])(.*)\1$/, `$2`).trim();
    }
  }

  if (fileName == null || fileName === ``) {
    throw new Error(`No filename in content-disposition`);
  }

  // Prevent path traversal by extracting only the base filename.
  // Replace backslashes first to handle Windows-style traversal paths on POSIX systems.
  const safeFileName = path.basename(fileName.replace(/\\/g, `/`));

  if (safeFileName === ``) {
    throw new Error(`No filename in content-disposition`);
  }

  const destination = path.resolve(dir, safeFileName);
  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
