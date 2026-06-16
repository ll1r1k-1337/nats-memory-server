import os from 'os';

const archMap: Record<string, string | undefined> = {
  x64: `amd64`,
  ia32: `386`,
  arm64: `arm64`,
};

export function getArch(): string {
  const osArch = os.arch();

  if (osArch === `arm`) {
    // Node reports `arm` for both ARMv6 and ARMv7, but NATS publishes distinct
    // `arm6`/`arm7` binaries. Disambiguate via the ABI the running Node binary
    // was compiled for, defaulting to v7 (the common case) when the hint is
    // unavailable. `arm_version` is not declared on @types/node's
    // `process.config`, so read it through a defensive cast.
    const armVersion = (
      process.config as { variables?: { arm_version?: string } } | undefined
    )?.variables?.arm_version;

    return armVersion === `6` ? `arm6` : `arm7`;
  }

  return archMap[osArch] ?? osArch;
}
