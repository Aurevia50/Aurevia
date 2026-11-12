# Aurevia toolchain

[`toolchain.json`](./toolchain.json) is the authoritative inventory of required and optional tools, their versions, purposes, installation methods, verification commands, and environments.

From the application directory, use `npm run setup` for the supported Node.js check, reproducible npm install, Prisma Client generation, Chromium installation, and tool verification. On Linux, setup installs Playwright system dependencies when root or passwordless sudo is available; otherwise follow the printed instruction and run `npm run browsers:install -- --with-deps` from an authorized account.

The browser cache at `tools/playwright/browsers/` is machine-specific, ignored by Git, and excluded from production builds. Do not copy it between machines or commit it.
