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

const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
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
  shell: isWin,
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
