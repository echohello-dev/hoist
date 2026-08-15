#!/usr/bin/env bash
set -euo pipefail

cd "$MISE_PROJECT_ROOT/cli"

bun install --frozen-lockfile
bun run typecheck
bun run scripts/build-all.ts
