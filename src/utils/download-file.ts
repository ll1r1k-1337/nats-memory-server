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

  const contentDisposition = response.headers.get(CONTENT_DISPOSITION_KEY);
  const match = contentDisposition?.match(
    /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i,
  );
  let rawFileName = match?.[1];

  if (rawFileName == null) {
    throw new Error(`No filename in content-disposition`);
  }

  // Clean up any surrounding quotes that might have been captured
  rawFileName = rawFileName.replace(/^(['"])(.*)\1$/, `$2`).trim();

  // Security validation: Prevent path traversal by extracting only the base name.
  // We replace backslashes with forward slashes to handle Windows paths in POSIX environments.
  const fileName = path.basename(rawFileName.replace(/\\/g, `/`));

  const destination = path.resolve(dir, fileName);
  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
