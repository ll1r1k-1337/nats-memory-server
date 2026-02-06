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
  let fileName = contentDisposition
    ?.split(`filename=`)?.[1]
    ?.split(`;`)?.[0]
    ?.trim();

  if (fileName == null || fileName.length === 0) {
    throw new Error(`No filename in content-disposition`);
  }

  fileName = fileName.replace(/^"|"$/g, ``);
  fileName = path.basename(fileName);

  if (fileName === `.` || fileName === `..`) {
    throw new Error(`Invalid filename: ${fileName}`);
  }

  const destination = path.resolve(dir, fileName);
  const fileStream = createWriteStream(destination);

  await pipeline(response.body, fileStream);

  return destination;
}
