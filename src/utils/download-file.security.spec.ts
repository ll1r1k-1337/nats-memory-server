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
  const mockCreateWriteStream = fs.createWriteStream as unknown as jest.Mock;
  const mockPipeline = pipeline as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`should prevent path traversal when filename contains directory components`, async () => {
    const url = `http://example.com/evil`;
    const dir = `/safe/dir`;
    const mockResponse = {
      ok: true,
      headers: {
        get: jest
          .fn()
          .mockReturnValue(`attachment; filename="../../../../etc/passwd"`),
      },
      body: `mockBody`,
    };

    mockFetch.mockResolvedValue(mockResponse);
    mockCreateWriteStream.mockReturnValue(`mockWriteStream`);
    mockPipeline.mockResolvedValue(undefined);

    const result = await downloadFile(url, dir);

    // Expect the destination to be safely resolved inside the intended directory
    expect(result).toBe(path.resolve(`/safe/dir`, `passwd`));
    expect(mockCreateWriteStream).toHaveBeenCalledWith(
      path.resolve(`/safe/dir`, `passwd`),
    );
  });
});
