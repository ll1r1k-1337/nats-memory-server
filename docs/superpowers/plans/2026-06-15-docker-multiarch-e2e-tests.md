# Docker Multi-Architecture E2E Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Docker-based end-to-end tests that install and run the published package on multiple emulated CPU architectures, and fix the arch-mapping bug those tests expose.

**Architecture:** A packed tarball (`npm pack`) is installed into a clean container of each target architecture; the package's real `postinstall` downloads the arch-specific `nats-server` binary, and a smoke script runs a NATS pub/sub round-trip. The same `e2e/` Dockerfile + entrypoint + smoke script are driven both by a local Node runner (`npm run test:e2e`) and by a GitHub Actions matrix workflow. Alongside, `src/utils/get-arch.ts` is fixed so 32-bit ARM/x86 resolve to the real release-asset names.

**Tech Stack:** TypeScript, Jest (ts-jest), Node 22, Docker + buildx + QEMU/binfmt, GitHub Actions.

---

## Background the engineer needs (read once)

- The package downloads `nats-server` on `postinstall`. The URL is `nats-server-${version}-${platform}-${arch}.zip`. `src/utils/get-arch.ts` maps `os.arch()` to the NATS arch token. NATS v2.9.16 Linux assets are: `386, amd64, arm6, arm64, arm7, mips64le, s390x`. The current map only handles `x64→amd64`, so `arm` (→ nonexistent `linux-arm`) and `ia32` (→ nonexistent `linux-ia32`) are broken.
- **Jest from this worktree:** the project lives under a `.claude/worktrees/...` dot-directory. Jest's `testMatch` glob will not traverse a `.`-prefixed path segment, so it matches **zero** tests here. Task 1 switches the config to `testRegex`, which matches the absolute path as a plain regex and works everywhere. **Do Task 1 first** — without it no test in this plan can run.
- **Pre-commit hook:** `.husky/pre-commit` runs `npm test` (the full jest suite) and `npx --no-install lint-staged` on every commit. After Task 1, `npm test` actually runs the integration specs, which spawn the real binary — so the binary must be present (Task 0). `lint-staged` only acts on staged `src/**/*.{js,ts,json}` files; commits that stage only `e2e/`, `docs/`, root config, `.github/`, or `README.md` skip it. **Never bypass the hook with `--no-verify`.**
- **String style:** ESLint enforces backtick strings (`@typescript-eslint/quotes: backtick`) for `.ts` files. All `.ts` snippets below use backticks. The `e2e/` JS files are excluded from lint/format (Task 2) and use ordinary single quotes.
- **Local emulation prerequisite:** running non-amd64 containers locally needs binfmt handlers: `docker run --privileged --rm tonistiigi/binfmt --install all` (one-time). amd64 needs no emulation.

---

## Task 0: Environment setup (no commit)

**Purpose:** make the worktree able to build, test, and run containers.

- [ ] **Step 1: Install dependencies without scripts**

The root `postinstall` references `dist/` (not built yet) and `prepare` runs `husky install` (must not run from a worktree), so use `--ignore-scripts`.

Run: `npm ci --ignore-scripts`
Expected: `added NNN packages` with no postinstall/prepare output.

- [ ] **Step 2: Build and download the binary**

Run: `npm run build && npm run postinstall`
Expected: ends with `Decompress was successful sources` and a `nats-server` binary under `node_modules/.cache/nats-memory-server/`.

- [ ] **Step 3: (Only if you will run emulated arches locally) install binfmt**

Run: `docker run --privileged --rm tonistiigi/binfmt --install all`
Expected: JSON output listing `qemu-aarch64`, `qemu-arm`, `qemu-s390x`, etc. Skip if you will only run the amd64 entry.

---

## Task 1: Make jest discover specs from any directory

**Files:**
- Modify: `jest.config.ts`

- [ ] **Step 1: Confirm the bug**

Run: `npx jest --listTests`
Expected: prints **nothing** (zero tests found) — this is the dot-directory bug.

- [ ] **Step 2: Switch `testMatch` to `testRegex`**

Replace the entire contents of `jest.config.ts` with:

```ts
import { type JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset: `ts-jest`,
  rootDir: `.`,
  testEnvironment: `node`,
  moduleFileExtensions: [`ts`, `tsx`, `js`, `jsx`, `json`, `node`],
  // Match spec files by regex rather than a glob. A `testMatch` glob like
  // `<rootDir>/**/*.spec.ts` silently matches nothing when the project lives
  // under a dot-directory (e.g. a git worktree at `.../.claude/worktrees/...`),
  // because `**` will not traverse a `.`-prefixed path segment. A regex over the
  // absolute path has no such restriction.
  testRegex: `\\.spec\\.ts$`,
  testPathIgnorePatterns: [`/node_modules/`],
  passWithNoTests: true,
};

export default config;
```

- [ ] **Step 3: Verify discovery works**

Run: `npx jest --listTests`
Expected: lists 7 files (`src/nats-server.spec.ts`, `src/nats-server.builder.spec.ts`, `src/nats-server.project-config.spec.ts`, `src/utils/download-file.spec.ts`, `src/utils/get-project-config.spec.ts`, `src/utils/verify-checksum.spec.ts`, `src/utils/with-retry.spec.ts`).

- [ ] **Step 4: Verify the full suite is green**

Run: `npm test`
Expected: `Test Suites: 7 passed, 7 total`, `Tests: 66 passed`.

- [ ] **Step 5: Commit**

```bash
git add jest.config.ts
git commit -m "test: discover specs via testRegex so jest works from worktrees"
```

Expected: the pre-commit hook runs `npm test` (now 66 passing) and reports `No staged files match any configured task` for lint-staged; commit succeeds.

---

## Task 2: Exclude `e2e/` and `docs/` from tooling; ignore the packed tarball

**Files:**
- Modify: `.eslintignore`
- Modify: `.prettierignore`
- Modify: `.gitignore`

This runs **before** any `e2e/` files exist so that later `src/` commits (which trigger `lint-staged`'s repo-wide `prettier --write .`) never reformat or fight the e2e/docs files.

- [ ] **Step 1: Add `e2e` to `.eslintignore`**

Append a final line `e2e` to `.eslintignore` so it reads (existing lines unchanged):

```
node_modules
dist
package.json
package-lock.json
tsconfig.json
tsconfig.build.json
.eslintrc.json
nest-cli.json
jest.*
tsconfig.app.json
scripts
example.js
e2e
```

- [ ] **Step 2: Add `e2e` and `docs` to `.prettierignore`**

Replace `.prettierignore` contents with:

```
node_modules
dist
package-lock.json
e2e
docs
```

- [ ] **Step 3: Ignore the generated tarball in `.gitignore`**

Append to the end of `.gitignore`:

```
# e2e packed tarball (generated by the e2e runner)
e2e/package.tgz
```

- [ ] **Step 4: Commit**

```bash
git add .eslintignore .prettierignore .gitignore
git commit -m "chore: exclude e2e and docs from lint/format tooling"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files.

---

## Task 3: Fix the architecture mapping (TDD)

**Files:**
- Test: `src/utils/get-arch.spec.ts` (create)
- Modify: `src/utils/get-arch.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/get-arch.spec.ts`:

```ts
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
    jest.spyOn(os, `arch`).mockReturnValue(osArch as ReturnType<typeof os.arch>);

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
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/utils/get-arch.spec.ts`
Expected: FAIL — `ia32` expects `386` but receives `ia32`; `arm` expects `arm7`/`arm6` but receives `arm`. (`x64`, `arm64`, `s390x` already pass.)

- [ ] **Step 3: Implement the fix**

Replace the entire contents of `src/utils/get-arch.ts` with:

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
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/utils/get-arch.spec.ts`
Expected: PASS — 7 tests (4 `it.each` rows + 3 arm cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/get-arch.ts src/utils/get-arch.spec.ts
git commit -m "fix(arch): map ia32->386 and arm->arm7/arm6 to match NATS release assets"
```

Expected: pre-commit `npm test` runs the full suite (now 73 tests) green; lint-staged runs `eslint . --fix` + `prettier --write .` on the staged src files and re-stages them; commit succeeds.

---

## Task 4: Lock the download-URL format (regression test)

**Files:**
- Test: `src/utils/get-url.spec.ts` (create)

This is a characterization test that pins the URL the (now-correct) arch tokens feed into; it passes against the existing `src/utils/get-url.ts`.

- [ ] **Step 1: Write the test**

Create `src/utils/get-url.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `npx jest src/utils/get-url.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 3: Commit**

```bash
git add src/utils/get-url.spec.ts
git commit -m "test(url): lock nats-server download URL format"
```

Expected: pre-commit `npm test` green; lint-staged processes the staged spec.

---

## Task 5: Add the e2e matrix definition

**Files:**
- Create: `e2e/matrix.json`

- [ ] **Step 1: Create the matrix file**

Create `e2e/matrix.json`:

```json
[
  {
    "name": "linux-amd64-glibc",
    "platform": "linux/amd64",
    "base": "node:22-bookworm-slim",
    "expectedArch": "amd64",
    "experimental": false
  },
  {
    "name": "linux-arm64-glibc",
    "platform": "linux/arm64",
    "base": "node:22-bookworm-slim",
    "expectedArch": "arm64",
    "experimental": false
  },
  {
    "name": "linux-amd64-musl",
    "platform": "linux/amd64",
    "base": "node:22-alpine",
    "expectedArch": "amd64",
    "experimental": false
  },
  {
    "name": "linux-armv7-glibc",
    "platform": "linux/arm/v7",
    "base": "node:22-bookworm-slim",
    "expectedArch": "arm7",
    "experimental": true
  },
  {
    "name": "linux-s390x-glibc",
    "platform": "linux/s390x",
    "base": "node:22-bookworm-slim",
    "expectedArch": "s390x",
    "experimental": true
  }
]
```

- [ ] **Step 2: Verify it is valid JSON**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('e2e/matrix.json','utf8')).length + ' entries')"`
Expected: `5 entries`.

- [ ] **Step 3: Commit**

```bash
git add e2e/matrix.json
git commit -m "test(e2e): add architecture matrix definition"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files (e2e is not under src).

---

## Task 6: Add the e2e container harness

**Files:**
- Create: `e2e/smoke.cjs`
- Create: `e2e/entrypoint.sh`
- Create: `e2e/Dockerfile`

- [ ] **Step 1: Create the smoke script**

Create `e2e/smoke.cjs`:

```js
// Runs inside the target-architecture container after the packed package and
// the nats client have been installed. Starts the server, performs one pub/sub
// round-trip, and exits 0 only if the message round-trips.
//
// Every await is timeout-guarded: the server child is unref()'d in start(), so
// in this minimal script the event loop can otherwise drain mid-teardown and
// exit 0 with the round-trip unverified. The timeouts both keep a ref'd timer
// alive long enough for calls to settle AND turn a real hang into a loud
// failure instead of a false success.
const { NatsServerBuilder } = require('nats-memory-server');
const { connect, StringCodec } = require('nats');

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms),
    ),
  ]);

(async () => {
  const server = await withTimeout(
    NatsServerBuilder.create().setVerbose(false).build().start(),
    30000,
    'server start',
  );
  const url = server.getUrl();
  const nc = await withTimeout(connect({ servers: url }), 15000, 'client connect');
  const sc = StringCodec();
  const sub = nc.subscribe('e2e.smoke', { max: 1 });
  nc.publish('e2e.smoke', sc.encode('ping'));

  let received;
  await withTimeout(
    (async () => {
      for await (const m of sub) received = sc.decode(m.data);
    })(),
    15000,
    'message round-trip',
  );

  if (received !== 'ping') {
    throw new Error('payload mismatch: got ' + String(received));
  }
  console.log('[e2e] OK ' + process.platform + '/' + process.arch + ' via ' + url);

  await withTimeout(nc.close(), 5000, 'client close').catch(() => {});
  await withTimeout(server.stop(), 5000, 'server stop').catch(() => {});
  process.exit(0);
})().catch((err) => {
  console.error('[e2e] FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Create the entrypoint**

Create `e2e/entrypoint.sh`:

```sh
#!/bin/sh
# Installs the packed package (its postinstall downloads the arch-specific
# nats-server binary) plus the nats client, then runs the smoke test.
set -eu

echo "[e2e] node $(node --version) on $(node -p 'process.platform + "/" + process.arch')"

cd /e2e
npm init -y >/dev/null 2>&1
npm install ./package.tgz nats@2 --no-audit --no-fund --loglevel=error
node ./smoke.cjs
```

- [ ] **Step 3: Create the Dockerfile**

Create `e2e/Dockerfile`:

```dockerfile
# Architecture-agnostic at build time (COPY only, no RUN), so
# `docker build --platform <p>` is cheap and all emulation happens at
# `docker run`. BASE selects glibc (bookworm-slim) vs musl (alpine).
ARG BASE=node:22-bookworm-slim
FROM ${BASE}
WORKDIR /e2e
COPY package.tgz smoke.cjs entrypoint.sh /e2e/
ENTRYPOINT ["sh", "/e2e/entrypoint.sh"]
```

- [ ] **Step 4: Verify the scripts are syntactically valid**

Run: `node --check e2e/smoke.cjs`
Expected: no output, exit 0. (Full container execution is verified in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add e2e/smoke.cjs e2e/entrypoint.sh e2e/Dockerfile
git commit -m "test(e2e): add Docker container smoke-test harness"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files.

---

## Task 7: Add the local multi-arch runner

**Files:**
- Create: `e2e/run.mjs`

- [ ] **Step 1: Create the runner**

Create `e2e/run.mjs`:

```js
#!/usr/bin/env node
// Local multi-architecture e2e runner. Builds + packs the package, then for
// each entry in matrix.json builds the target-platform image and runs the
// container (install tarball -> download arch-specific nats-server -> pub/sub
// round-trip). Cross-platform (works under Windows PowerShell).
//
// Requires Docker. Non-amd64 entries require binfmt emulation:
//   docker run --privileged --rm tonistiigi/binfmt --install all
//
// Usage:
//   node e2e/run.mjs                          # whole matrix
//   node e2e/run.mjs --only linux-amd64-glibc # one entry
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, '..');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex !== -1 ? process.argv[onlyIndex + 1] : undefined;

const matrix = JSON.parse(readFileSync(path.join(e2eDir, 'matrix.json'), 'utf8'));
const entries = only ? matrix.filter((m) => m.name === only) : matrix;

if (entries.length === 0) {
  console.error(
    `No matrix entry named "${only}". Known: ${matrix.map((m) => m.name).join(', ')}`,
  );
  process.exit(1);
}

// 1. Build + pack the package into e2e/package.tgz.
run('npm', ['run', 'build'], { cwd: repoRoot });
const packJson = execFileSync('npm', ['pack', '--ignore-scripts', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
const tarballName = JSON.parse(packJson)[0].filename;
copyFileSync(path.join(repoRoot, tarballName), path.join(e2eDir, 'package.tgz'));
rmSync(path.join(repoRoot, tarballName));

// 2. Build + run each entry.
const results = [];
for (const entry of entries) {
  const tag = `natsmem-e2e:${entry.name}`;
  let ok = true;
  try {
    run('docker', [
      'build',
      '--platform',
      entry.platform,
      '--build-arg',
      `BASE=${entry.base}`,
      '-t',
      tag,
      e2eDir,
    ]);
    run('docker', ['run', '--rm', '--platform', entry.platform, tag]);
  } catch {
    ok = false;
  }
  results.push({ name: entry.name, ok, experimental: Boolean(entry.experimental) });
}

// 3. Summary + exit code. Experimental failures are reported but non-fatal.
console.log('\n=== e2e results ===');
for (const r of results) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.experimental ? '  (experimental)' : ''}`,
  );
}
const hardFailure = results.some((r) => !r.ok && !r.experimental);
process.exit(hardFailure ? 1 : 0);
```

- [ ] **Step 2: Verify syntax**

Run: `node --check e2e/run.mjs`
Expected: no output, exit 0.

- [ ] **Step 3: Run the amd64 entry end-to-end (no emulation needed)**

Run: `node e2e/run.mjs --only linux-amd64-glibc`
Expected: ends with `[e2e] OK linux/x64 via nats://127.0.0.1:<port>` and an `=== e2e results ===` block showing `PASS  linux-amd64-glibc`; exit 0.

- [ ] **Step 4: Commit**

```bash
git add e2e/run.mjs
git commit -m "test(e2e): add local multi-arch runner"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files. (`e2e/package.tgz` is git-ignored from Task 2 and is not committed.)

---

## Task 8: Wire the `test:e2e` npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

In `package.json`, in the `"scripts"` object, add a `test:e2e` entry immediately after the `"test"` line so it reads:

```json
    "test": "jest",
    "test:e2e": "node e2e/run.mjs"
```

(Leave every other script unchanged.)

- [ ] **Step 2: Verify it is wired**

Run: `npm run test:e2e -- --only linux-amd64-glibc`
Expected: same successful amd64 run as Task 7 Step 3 (`PASS  linux-amd64-glibc`).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "test(e2e): add test:e2e npm script"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files (root `package.json` is not under `src/`).

---

## Task 9: Add the CI workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/e2e.yml`:

```yaml
name: E2E (multi-arch)

on:
  pull_request:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * 1' # weekly, Monday 06:00 UTC

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.read.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - id: read
        run: echo "matrix=$(jq -c . e2e/matrix.json)" >> "$GITHUB_OUTPUT"

  build-tarball:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci --ignore-scripts
      - run: npm run build
      - run: npm pack --ignore-scripts
      - run: mv nats-memory-server-*.tgz e2e/package.tgz
      - uses: actions/upload-artifact@v4
        with:
          name: package-tarball
          path: e2e/package.tgz

  e2e:
    needs: [setup, build-tarball]
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        include: ${{ fromJSON(needs.setup.outputs.matrix) }}
    continue-on-error: ${{ matrix.experimental }}
    name: e2e ${{ matrix.name }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: package-tarball
          path: e2e
      - uses: docker/setup-qemu-action@v3
      - name: Build image
        run: docker build --platform ${{ matrix.platform }} --build-arg BASE=${{ matrix.base }} -t natsmem-e2e:${{ matrix.name }} e2e
      - name: Run e2e
        run: docker run --rm --platform ${{ matrix.platform }} natsmem-e2e:${{ matrix.name }}
```

- [ ] **Step 2: Verify the YAML parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/e2e.yml','utf8');if(!s.includes('fromJSON(needs.setup.outputs.matrix)'))throw new Error('matrix wiring missing');console.log('workflow present, '+s.split(String.fromCharCode(10)).length+' lines')"`
Expected: `workflow present, NN lines`. (Full validation happens on the first PR run; this is a sanity check.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add multi-arch e2e workflow"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files.

---

## Task 10: Document supported architectures and e2e usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Insert the documentation section**

In `README.md`, insert the following block on its own line **immediately before** the line `## 📋 Requirements`:

```markdown
## 🖥️ Supported architectures

`postinstall` downloads the official `nats-server` binary for your OS and CPU.
These are verified end-to-end on every run of the multi-arch suite:

| OS    | Architecture       | Notes                  |
| ----- | ------------------ | ---------------------- |
| Linux | x64 (amd64)        | glibc and musl/Alpine  |
| Linux | arm64              |                        |
| Linux | armv7 (32-bit ARM) | resolves to `arm7`     |
| Linux | s390x              | big-endian             |

32-bit x86 (`ia32` → `386`) and ARMv6 (`arm6`) resolve to the correct binary and
are covered by unit tests, but are not run as containers (no official 32-bit Node
image; flaky ARMv6 emulation). macOS (`darwin`) and Windows use the matching
native binaries.

### Running the multi-arch e2e tests

```bash
# one-time: register QEMU emulators for non-amd64 architectures
docker run --privileged --rm tonistiigi/binfmt --install all

npm run test:e2e                          # whole matrix (slow; uses emulation)
node e2e/run.mjs --only linux-amd64-glibc # a single architecture (no emulation)
```

Each run packs the package, installs it inside a clean container for every entry
in [`e2e/matrix.json`](e2e/matrix.json), and performs a NATS pub/sub round-trip.
Requires Docker.

```

(Note: the fenced block above ends the inserted section; keep the existing
`## 📋 Requirements` heading right after it.)

- [ ] **Step 2: Verify the section is present**

Run: `node -e "const s=require('fs').readFileSync('README.md','utf8');if(!s.includes('Supported architectures')||!s.includes('npm run test:e2e'))throw new Error('missing');console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document supported architectures and e2e tests"
```

Expected: pre-commit `npm test` green; lint-staged reports no matching staged files (README is not under `src/`).

---

## Final verification (optional, after Task 10)

- [ ] **Run the full local matrix** (requires binfmt from Task 0 Step 3; ~5–10 min):

Run: `npm run test:e2e`
Expected: an `=== e2e results ===` block. `linux-amd64-glibc`, `linux-arm64-glibc`, `linux-amd64-musl` show `PASS` (required). `linux-armv7-glibc` and `linux-s390x-glibc` show `PASS` or `FAIL  (experimental)` — experimental failures do not change the exit code. Exit 0 means all required arches passed.

---

## Notes for the implementer

- **Do not use `git commit --no-verify`.** If a commit fails, read the hook output and fix the cause.
- The arch fix is `fix:` (patch release); everything else is `test:`/`ci:`/`chore:`/`docs:` (no version bump) — this matches the repo's conventional-commit release flow.
- Verified during planning: jest discovery via `testRegex` (66 existing tests green from this worktree); `Object.defineProperty` mocking of `process.config`; the amd64 and arm64 containers both run `[e2e] OK` (arm64 under QEMU after `tonistiigi/binfmt --install all`).
- Known feasibility limits baked into the matrix: no official 32-bit Node image (so `386` is unit-test-only) and NATS ships no `ppc64le` asset for v2.9.16 (so it is excluded), even though the `node` image supports it.
```
