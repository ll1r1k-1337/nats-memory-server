import { getUrl } from './get-url';

describe(`getUrl`, () => {
  it(`builds the release asset URL`, () => {
    expect(getUrl(`v2.9.16`, `linux`, `amd64`)).toBe(
      `https://github.com/nats-io/nats-server/releases/download/v2.9.16/nats-server-v2.9.16-linux-amd64.zip`,
    );
  });

  it(`builds arch-specific asset URLs`, () => {
    expect(getUrl(`v2.9.16`, `linux`, `arm7`)).toContain(`-linux-arm7.zip`);
    expect(getUrl(`v2.9.16`, `linux`, `386`)).toContain(`-linux-386.zip`);
    expect(getUrl(`v2.9.16`, `linux`, `s390x`)).toContain(`-linux-s390x.zip`);
  });

  it(`builds the source archive URL when buildFromSource is true`, () => {
    expect(getUrl(`v2.9.16`, `linux`, `amd64`, true)).toBe(
      `https://github.com/nats-io/nats-server/archive/refs/tags/v2.9.16.zip`,
    );
  });
});
