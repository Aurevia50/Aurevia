#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
browser_path="$project_root/tools/playwright/browsers"
install_os_deps=false
install_all_browsers=false

for argument in "$@"; do
  case "$argument" in
    --with-deps) install_os_deps=true ;;
    --all) install_all_browsers=true ;;
    *)
      printf 'Usage: %s [--with-deps] [--all]\n' "$0" >&2
      exit 2
      ;;
  esac
done

cd "$project_root"
export PLAYWRIGHT_BROWSERS_PATH="$browser_path"
mkdir -p "$browser_path"
playwright_cli="$project_root/node_modules/@playwright/test/cli.js"
if [[ ! -f "$playwright_cli" ]]; then
  printf 'Playwright is not installed. Run npm ci from %s first.\n' "$project_root" >&2
  exit 1
fi
browser_names=(chromium)
if [[ "$install_all_browsers" == true ]]; then
  browser_names+=(firefox webkit)
fi

if [[ "$install_os_deps" == true ]]; then
  if [[ "$(id -u)" -eq 0 ]]; then
    node "$playwright_cli" install-deps "${browser_names[@]}"
  elif command -v sudo >/dev/null 2>&1; then
    sudo env "PATH=$PATH" node "$playwright_cli" install-deps "${browser_names[@]}"
  else
    printf 'Installing Linux browser libraries requires root or sudo. Run this script with --with-deps from an authorized account.\n' >&2
    exit 1
  fi
fi

node "$playwright_cli" install "${browser_names[@]}"
printf 'Chromium browser cache: %s\n' "$browser_path"
