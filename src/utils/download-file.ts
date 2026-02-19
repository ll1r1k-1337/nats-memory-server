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
    // Try to extract filename using regex for quoted and unquoted values
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match != null) {
      fileName = match[1];
    } else {
      // Fallback to simple split if regex doesn't match
      fileName = contentDisposition.split(`filename=`)?.[1];
    }
  }

  if (fileName == null) {
    throw new Error(`No filename in content-disposition`);
  }

  // Sanitize filename to prevent path traversal
  fileName = path.basename(fileName);

  const destination = path.resolve(dir, fileName);

  // Ensure the resolved path is within the target directory
  const resolvedDir = path.resolve(dir);
  if (!destination.startsWith(resolvedDir)) {
    throw new Error(`Invalid destination path: ${destination}`);
  }

  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
