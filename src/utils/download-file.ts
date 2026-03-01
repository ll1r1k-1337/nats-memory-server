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
  let fileName: string | undefined;

  if (contentDisposition != null) {
    const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i.exec(
      contentDisposition,
    );
    if (match?.[1] != null) {
      fileName = match[1].replace(/^['"]|['"]$/g, ``);
    }
  }

  if (fileName == null || fileName.trim() === ``) {
    throw new Error(`No filename in content-disposition`);
  }

  // Security Enhancement: Prevent path traversal by extracting only the base name.
  // This ensures malicious servers cannot write outside the intended directory.
  const safeFileName = path.basename(fileName);
  const destination = path.resolve(dir, safeFileName);
  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
