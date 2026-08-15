#!/usr/bin/env bash
set -euo pipefail

: "${HOIST_CLI_OUTFILE:?HOIST_CLI_OUTFILE is required}"
: "${HOIST_CLI_TARGET:?HOIST_CLI_TARGET is required}"

cd "$MISE_PROJECT_ROOT/cli"

bun install --frozen-lockfile
bun run typecheck
bun build src/index.ts --compile --outfile="$HOIST_CLI_OUTFILE" --target="$HOIST_CLI_TARGET"
