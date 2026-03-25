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

export async function downloadFile(
  url: string,
  dir = `./`,
  options: DownloadFileOptions = {},
): Promise<string> {
  const proxy = url.startsWith(`https:`)
    ? options.httpsProxy
    : options.httpProxy;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchOptions: any = {};

  if (proxy != null) {
    fetchOptions.proxy = proxy;
  }
  if (options.noProxy != null) {
    fetchOptions.noProxy = options.noProxy;
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  let fileName = response.headers
    .get(CONTENT_DISPOSITION_KEY)
    ?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i)?.[1];

  if (fileName == null) {
    throw new Error(`No filename in content-disposition`);
  }

  fileName = fileName.replace(/^(['"])(.*)\1$/, `$2`).trim();
  // Prevent Path Traversal by removing directory components
  const safeFileName = path.basename(fileName.replace(/\\/g, `/`));

  const destination = path.resolve(dir, safeFileName);
  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
