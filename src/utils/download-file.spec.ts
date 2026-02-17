import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`path`);
jest.mock(`stream/promises`);

describe(`downloadFile`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockResolve = path.resolve as unknown as jest.Mock;
  const mockBasename = path.basename as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBasename.mockReturnValue(`file.zip`);
  });

  it(`should download a file successfully`, async () => {
    const url = `http://example.com/file.zip`;
    const dir = `/tmp`;
    const destination = `/tmp/file.zip`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=file.zip`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockResolve.mockReturnValue(destination);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    expect(result).toBe(destination);
    expect(mockFetch).toHaveBeenCalledWith(url, {});
    expect(mockResolve).toHaveBeenCalledWith(dir, `file.zip`);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(destination);
    expect(mockPipeline).toHaveBeenCalledWith(`mockBody`, `mockWriteStream`);
  });

  it(`should use httpProxy if provided for http url`, async () => {
    const url = `http://example.com/file.zip`;
    const proxy = `http://proxy.com`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=file.zip`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockResolve.mockReturnValue(`/tmp/file.zip`);
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, `/tmp`, { httpProxy: proxy });

    expect(mockFetch).toHaveBeenCalledWith(url, { proxy });
  });

  it(`should use httpsProxy if provided for https url`, async () => {
    const url = `https://example.com/file.zip`;
    const proxy = `http://proxy.com`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=file.zip`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockResolve.mockReturnValue(`/tmp/file.zip`);
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, `/tmp`, { httpsProxy: proxy });

    expect(mockFetch).toHaveBeenCalledWith(url, { proxy });
  });

  it(`should use noProxy if provided`, async () => {
    const url = `http://example.com/file.zip`;
    const noProxy = `example.com`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename=file.zip`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockResolve.mockReturnValue(`/tmp/file.zip`);
    mockPipeline.mockResolvedValue(undefined);

    await downloadFile(url, `/tmp`, { noProxy });

    expect(mockFetch).toHaveBeenCalledWith(url, { noProxy });
  });

  it(`should throw error if response is not ok`, async () => {
    const url = `http://example.com/file.zip`;
    const mockResponse = {
      ok: false,
      statusText: `Not Found`,
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(downloadFile(url)).rejects.toThrow(
      `Failed to download http://example.com/file.zip: Not Found`,
    );
  });

  it(`should throw error if filename is missing`, async () => {
    const url = `http://example.com/file.zip`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(null),
      },
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(downloadFile(url)).rejects.toThrow(
      `No filename in content-disposition`,
    );
  });
});
