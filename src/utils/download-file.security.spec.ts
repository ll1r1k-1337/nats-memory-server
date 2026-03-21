import { downloadFile } from './download-file';
import fetch from 'make-fetch-happen';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

jest.mock(`make-fetch-happen`);
jest.mock(`fs`);
jest.mock(`stream/promises`);

describe(`downloadFile security`, () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should sanitize Path Traversal in Content-Disposition`, async () => {
    const url = `http://example.com/malicious.zip`;
    const dir = `/safe/dir`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename=../../../etc/passwd`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    // It should have resolved the sanitized filename 'passwd' against '/safe/dir'
    const expectedDest = path.resolve(dir, `passwd`);
    expect(result).toBe(expectedDest);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedDest);
  });

  it(`should sanitize Windows Path Traversal in Content-Disposition`, async () => {
    const url = `http://example.com/malicious2.zip`;
    const dir = `/safe/dir`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(
            `attachment; filename="..\\..\\..\\windows\\system32\\cmd.exe"`,
          ),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    // It should have resolved the sanitized filename 'cmd.exe' against '/safe/dir'
    const expectedDest = path.resolve(dir, `cmd.exe`);
    expect(result).toBe(expectedDest);
    expect(mockCreateWriteStream).toHaveBeenCalledWith(expectedDest);
  });
});
