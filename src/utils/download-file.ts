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
  const match = contentDisposition?.match(/filename=(?:"([^"]+)"|([^;]+))/i);
  let fileName = match?.[1] ?? match?.[2];

  if (fileName == null) {
    // Fallback to original logic if regex fails (though unlikely for valid headers)
    // or just throw error as before.
    // The original logic was:
    fileName = contentDisposition?.split(`filename=`)?.[1];
  }

  if (fileName == null) {
    throw new Error(`No filename in content-disposition`);
  }

  // Sanitize filename to prevent path traversal
  fileName = path.basename(fileName);

  const destination = path.resolve(dir, fileName);
  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
