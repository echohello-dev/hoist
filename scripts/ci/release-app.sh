#!/usr/bin/env bash
set -euo pipefail

cd "$MISE_PROJECT_ROOT"

npm ci
npm run package -- "$@"
