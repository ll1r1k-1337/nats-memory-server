#!/bin/sh
# Installs the packed package (its postinstall downloads the arch-specific
# nats-server binary) plus the nats client, then runs the smoke test.
set -eu

echo "[e2e] node $(node --version) on $(node -p 'process.platform + "/" + process.arch')"

cd /e2e
npm init -y >/dev/null 2>&1
npm install ./package.tgz nats@2 --no-audit --no-fund --loglevel=error
node ./smoke.cjs
