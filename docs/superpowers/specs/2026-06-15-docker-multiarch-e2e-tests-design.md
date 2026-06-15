# Docker-based multi-architecture e2e tests — Design

**Date:** 2026-06-15
**Status:** Approved (design)
**Scope:** Add end-to-end tests that install and run the published package on multiple
CPU architectures via emulated Docker containers, and fix the arch-mapping bug those
tests expose.

---

## 1. Motivation

`nats-memory-server`'s entire job on a given architecture is:

1. detect `os.arch()` / `os.platform()`,
2. build a download URL of the form
   `nats-server-${version}-${platform}-${arch}.zip`,
3. download + checksum-verify + unzip the matching `nats-server` binary,
4. spawn it and wait for the `Server is ready` line.

The existing unit/integration tests **mock the download**, so they cannot catch:

- a wrong architecture token that resolves to a non-existent release asset, or
- a binary that downloads but won't `exec` on the target CPU.

Emulated-CPU Docker e2e tests exercise exactly this path end-to-end.

### The bug this surfaces

The real NATS v2.9.16 Linux release assets are:

```
386, amd64, arm6, arm64, arm7, mips64le, s390x   (+ SHA256SUMS)
```

But `src/utils/get-arch.ts` only maps `x64 → amd64` and passes everything else through
verbatim:

- `x64 → amd64` ✓ and `arm64 → arm64` ✓ — correct
- `arm → arm` ✗ — there is **no** `linux-arm` asset (NATS ships `arm6` / `arm7`) →
  install 404s on 32-bit ARM (e.g. Raspberry Pi OS 32-bit, armv7)
- `ia32 → ia32` ✗ — there is **no** `linux-ia32` asset (NATS ships `386`) →
  install fails on 32-bit x86

This work fixes the mapping and adds e2e coverage that verifies the fix on real
emulated CPUs.

---

## 2. What we test (approach)

**Chosen approach: packed-tarball consumer smoke test.**

> `npm pack` the local source → in a clean container of the target architecture,
> `npm install <tarball> nats` (this fires the real `postinstall` → arch-specific
> download + checksum verification) → run a tiny script that starts the server and
> performs a publish/subscribe round-trip → assert the message round-trips.

A wrong-arch binary cannot `exec`, so a green round-trip proves the correct binary was
selected, downloaded, and executed end-to-end on that CPU.

### Approaches considered and rejected

- **Repo jest suite inside each container** — rejected as the primary mechanism: it
  needs devDependencies / ts-jest, tests the source tree rather than the published
  package shape, and the amd64 unit/integration run already exists in
  `.github/workflows/test.yml`.
- **Both (tarball smoke + jest in container)** — unnecessary; the tarball smoke is the
  high-value part and the jest suite already runs on amd64.

---

## 3. The arch-mapping fix (ships with the tests)

`src/utils/get-arch.ts` becomes:

```ts
import os from 'os';

const archMap: Record<string, string | undefined> = {
  x64: `amd64`,
  ia32: `386`,
  arm64: `arm64`,
};

export function getArch(): string {
  const osArch = os.arch();
  if (osArch === `arm`) {
    // Node reports `arm` for both ARMv6 and ARMv7; NATS ships distinct arm6/arm7
    // binaries. Disambiguate via the ABI the Node binary was compiled for,
    // defaulting to v7 (the common case) when the hint is absent.
    const armVersion = (
      process.config?.variables as Record<string, unknown> | undefined
    )?.arm_version;
    return armVersion === `6` ? `arm6` : `arm7`;
  }
  return archMap[osArch] ?? osArch;
}
```

- `getPlatform` is **unchanged**: `linux` / `darwin` already pass through correctly and
  we only run Linux containers.
- `arm_version` comes from `process.config.variables.arm_version`, the same signal
  native-module download scripts use. It is accessed defensively (cast + optional
  chaining) because `@types/node` does not declare it.

### Unit tests

- `src/utils/get-arch.spec.ts` (new) — mock `os.arch()` and `process.config` and lock
  every branch:
  - `x64 → amd64`
  - `ia32 → 386`
  - `arm64 → arm64`
  - `arm` + `arm_version === '7'` → `arm7`
  - `arm` + `arm_version === '6'` → `arm6`
  - `arm` + missing/unknown `arm_version` → `arm7` (default)
  - `s390x` → `s390x` (passthrough)
- `src/utils/get-url.spec.ts` (new) — pin the URL format for both the release-asset and
  `buildFromSource` branches, so a future refactor can't silently change the asset name.

These unit tests are the **only** coverage for the `ia32 → 386` fix (see the 386 caveat
in §4).

---

## 4. Architecture matrix

Grounded in the intersection of (a) NATS v2.9.16 Linux assets and (b) the platforms the
official `node:22` image actually publishes
(`node:22-bookworm-slim`: `amd64, arm32v7, arm64v8, ppc64le, s390x`;
`node:22-alpine`: `amd64, arm32v6, arm32v7, arm64v8, s390x`).

| Entry            | Docker platform | Base image             | NATS asset | Tier         |
| ---------------- | --------------- | ---------------------- | ---------- | ------------ |
| amd64 / glibc    | `linux/amd64`   | `node:22-bookworm-slim`| `amd64`    | required     |
| arm64 / glibc    | `linux/arm64`   | `node:22-bookworm-slim`| `arm64`    | required     |
| amd64 / musl     | `linux/amd64`   | `node:22-alpine`       | `amd64`    | required     |
| armv7 / glibc    | `linux/arm/v7`  | `node:22-bookworm-slim`| `arm7`     | experimental |
| s390x / glibc    | `linux/s390x`   | `node:22-bookworm-slim`| `s390x`    | experimental |

- **required** — failure blocks the CI job.
- **experimental** — `continue-on-error` in CI: QEMU emulation of arm/s390x can hiccup,
  so a flaky emulator never blocks a PR while still reporting status. Promote to
  required once empirically stable.
- The `amd64 / musl` entry exercises the statically-linked Go binary against musl libc
  (Alpine), a common real-world CI base.
- The `s390x` entry additionally exercises a **big-endian** host.

### Feasibility caveats (explicitly out of the container matrix)

- **386 (32-bit x86):** the mapping fix (`ia32 → 386`) is real and unit-tested, but a
  *container* e2e is **not feasible** — there is no official 32-bit Node image and
  upstream 32-bit Linux Node is EOL. Covered by the `get-arch.spec.ts` unit test only.
- **ppc64le:** `node` publishes it, but NATS v2.9.16 does **not** ship a ppc64le asset →
  excluded.
- **arm/v6 (`arm6`):** feasible via `node:22-alpine` (arm32v6) but left out of the
  default matrix — QEMU v6 is the flakiest emulation target; the `arm → arm6` path is
  covered by the unit test instead. Can be added later if desired.

---

## 5. Components & layout

All new files live under a new `e2e/` directory, shared by the local runner and CI:

- **`e2e/matrix.json`** — single source of truth for the matrix table. Array of
  `{ name, platform, base, expectedArch, experimental }`. Read by both the local runner
  and the CI `setup` step.
- **`e2e/Dockerfile`** — `ARG BASE`; `FROM ${BASE}`; `COPY` the tarball + smoke files;
  `ENTRYPOINT` only. **No `RUN` instruction**, so `docker build --platform=…` stays
  cheap (COPY is architecture-agnostic — no emulation) and all emulation happens at
  `docker run`.
- **`e2e/entrypoint.sh`** — in a temp working dir: `npm init -y` →
  `npm install /e2e/package.tgz nats@2 --no-audit --no-fund` (fires the real
  `postinstall` / arch-specific download on this CPU) → `node /e2e/smoke.cjs`.
- **`e2e/smoke.cjs`** — the assertion:
  `NatsServerBuilder.create().setVerbose(false).build().start()` → `connect()` →
  publish + subscribe a single message, compare the decoded payload → `stop()`.
  Non-zero exit on any failure; logs `process.arch` / `process.platform` for the report.

The tarball is copied into the build context as a fixed name `e2e/package.tgz` so the
Dockerfile `COPY` and the entrypoint reference a stable path regardless of version.

---

## 6. Local runner

- **`e2e/run.mjs`** — Node script (cross-platform; runs under Windows PowerShell):
  1. build + pack: `npm run build` then `npm pack --ignore-scripts`, place the result at
     `e2e/package.tgz`. (`--ignore-scripts` avoids the `prepare`/husky lifecycle; `dist`
     is already built and is included via the `files` field.)
  2. for each matrix entry: `docker build --platform <p> --build-arg BASE=<base> …`
     then `docker run --rm --platform <p> …`.
  3. aggregate exit codes, print a pass/fail summary table, exit non-zero if any
     **required** entry failed (experimental failures are reported but non-fatal).
- Wired as **`npm run test:e2e`**.
- Relies on Docker Desktop's built-in QEMU/binfmt emulation (documented prerequisite).
- **Kept out of `npm test`** so the normal jest run requires no Docker.

---

## 7. CI workflow

New **`.github/workflows/e2e.yml`**, separate from the existing `test.yml`:

- **Triggers:** `pull_request` → `main`, `workflow_dispatch`, and a weekly `schedule`.
  (Emulation is slow; we do not run it on every branch push the way `test.yml` does.)
- **`build-tarball` job** (native `ubuntu-latest` / amd64): `npm ci` → `npm run build` →
  `npm pack --ignore-scripts` → upload the `.tgz` as a workflow artifact.
- **`e2e` job:** `needs: build-tarball`; matrix sourced from `e2e/matrix.json` via
  `fromJSON`; `fail-fast: false`; `continue-on-error: ${{ matrix.experimental }}`.
  Steps: checkout → download the tarball artifact into `e2e/package.tgz` →
  `docker/setup-qemu-action` → `docker build` + `docker run` (reusing the same
  `e2e/Dockerfile` + `e2e/entrypoint.sh` as the local runner). Generous per-job timeout
  (~25 min) for emulated installs.

---

## 8. Documentation

- A short **"Supported architectures"** section in `README.md`, listing exactly which
  arches resolve to real binaries (now that the mapping is fixed and verified).
- A one-line note on `npm run test:e2e` and its Docker + QEMU prerequisite.

---

## 9. Out of scope (YAGNI)

- Multiple NATS versions in the matrix (default `v2.9.16` only).
- `buildFromSource` / Go toolchain path on exotic arches.
- Windows / macOS containers.
- Publishing multi-arch Docker images.

---

## 10. Commit split

- `fix:` — the `get-arch.ts` mapping fix + its unit tests (a real bugfix).
- `test:` / `ci:` — the `e2e/` harness, the local runner, the CI workflow, and the docs.
