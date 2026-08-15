#!/usr/bin/env bash
set -euo pipefail

cd "$MISE_PROJECT_ROOT"

npm ci
npm run catalog:check
npm run typecheck
npm run lint
npm test
npm run build
