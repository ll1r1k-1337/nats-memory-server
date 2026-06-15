import os from 'os';
import { getArch } from './get-arch';

describe(`getArch`, () => {
  const originalConfig = Object.getOwnPropertyDescriptor(process, `config`);

  function mockArmVersion(armVersion: string | undefined): void {
    Object.defineProperty(process, `config`, {
      value: {
        variables: armVersion === undefined ? {} : { arm_version: armVersion },
      },
      configurable: true,
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalConfig !== undefined) {
      Object.defineProperty(process, `config`, originalConfig);
    }
  });

  it.each<[string, string]>([
    [`x64`, `amd64`],
    [`ia32`, `386`],
    [`arm64`, `arm64`],
    [`s390x`, `s390x`],
  ])(`maps os.arch %s to %s`, (osArch, expected) => {
    jest.spyOn(os, `arch`).mockReturnValue(osArch);

    expect(getArch()).toBe(expected);
  });

  it(`maps arm to arm7 when arm_version is 7`, () => {
    jest.spyOn(os, `arch`).mockReturnValue(`arm` as ReturnType<typeof os.arch>);
    mockArmVersion(`7`);

    expect(getArch()).toBe(`arm7`);
  });

  it(`maps arm to arm6 when arm_version is 6`, () => {
    jest.spyOn(os, `arch`).mockReturnValue(`arm` as ReturnType<typeof os.arch>);
    mockArmVersion(`6`);

    expect(getArch()).toBe(`arm6`);
  });

  it(`maps arm to arm7 when arm_version is unavailable`, () => {
    jest.spyOn(os, `arch`).mockReturnValue(`arm` as ReturnType<typeof os.arch>);
    mockArmVersion(undefined);

    expect(getArch()).toBe(`arm7`);
  });
});
