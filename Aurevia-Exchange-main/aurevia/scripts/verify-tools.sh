#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

node scripts/check-node-version.mjs
npm ls --depth=0 \
  @playwright/test \
  @axe-core/playwright \
  @vitest/coverage-v8 \
  @simplewebauthn/browser \
  @simplewebauthn/server \
  bottleneck \
  eslint \
  lru-cache \
  p-retry \
  prisma \
  @prisma/client \
  otplib \
  qrcode \
  rate-limiter-flexible \
  typescript \
  lighthouse \
  vitest
node node_modules/@playwright/test/cli.js --version
PLAYWRIGHT_BROWSERS_PATH="$project_root/tools/playwright/browsers" node scripts/verify-playwright-browser.mjs
