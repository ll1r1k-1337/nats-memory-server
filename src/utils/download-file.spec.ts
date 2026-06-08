import { downloadFile, fetchText } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`path`, () => ({
  resolve: jest.fn(),
  basename: jest.fn((p: string) => p.split(`/`).pop()?.split(`\\`).pop() ?? p),
}));
jest.mock(`stream/promises`);

describe(`downloadFile`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockResolve = path.resolve as unknown as jest.Mock;
  const mockBasename = path.basename as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it(`should strip path traversal sequences from the filename`, async () => {
    const url = `http://example.com/file`;
    const dir = `/tmp`;
    const destination = `/tmp/passwd`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename="../../etc/passwd"`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockResolve.mockReturnValue(destination);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    // The traversal sequence must be reduced to its base name before resolving,
    // so the write can never escape `dir`.
    expect(mockBasename).toHaveBeenCalledWith(`../../etc/passwd`);
    expect(mockResolve).toHaveBeenCalledWith(dir, `passwd`);
    expect(result).toBe(destination);
  });

  it(`should throw when the filename reduces to an empty base name`, async () => {
    const url = `http://example.com/file`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue(`attachment; filename="../../"`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);

    await expect(downloadFile(url, `/tmp`)).rejects.toThrow(
      `No filename in content-disposition`,
    );
    expect(mockCreateWriteStream).not.toHaveBeenCalled();
  });
});

describe(`fetchText`, () => {
  const mockFetch = fetch as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`returns the response body text`, async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(`hash  asset.zip`),
    });

    const result = await fetchText(`https://example.com/SHA256SUMS`);

    expect(result).toBe(`hash  asset.zip`);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://example.com/SHA256SUMS`,
      {},
    );
  });

  it(`passes the https proxy for an https target`, async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(`x`),
    });

    await fetchText(`https://example.com/SHA256SUMS`, {
      httpsProxy: `http://proxy.com`,
    });

    expect(mockFetch).toHaveBeenCalledWith(`https://example.com/SHA256SUMS`, {
      proxy: `http://proxy.com`,
    });
  });

  it(`throws when the response is not ok`, async () => {
    mockFetch.mockResolvedValue({ ok: false, statusText: `Not Found` });

    await expect(fetchText(`https://example.com/SHA256SUMS`)).rejects.toThrow(
      `Failed to fetch https://example.com/SHA256SUMS: Not Found`,
    );
  });
});
