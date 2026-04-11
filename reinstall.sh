#!/bin/bash
set -e

cd "$(dirname "$0")"
echo "=== Working directory: $(pwd)"

echo "=== Removing node_modules..."
rm -rf node_modules

echo "=== Loading nvm..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use default

echo "=== Node version: $(node --version)"
echo "=== pnpm version: $(pnpm --version)"

echo "=== Installing dependencies for Linux..."
pnpm install

echo "=== Verifying rolldown binding..."
ls node_modules/@rolldown/binding-linux-x64-gnu/ 2>/dev/null && echo "Linux binding found!" || echo "WARNING: Linux binding NOT found"

echo "=== Starting dev server..."
echo "Run 'pnpm dev' to start the dev server"
