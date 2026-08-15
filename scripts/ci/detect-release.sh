#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REF:?GITHUB_REF is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

tag="${GITHUB_REF#refs/tags/}"

if [[ "$tag" == cli-* ]]; then
  echo "component=cli" >> "$GITHUB_OUTPUT"
elif [[ "$tag" == v* ]]; then
  echo "component=app" >> "$GITHUB_OUTPUT"
else
  echo "Unknown tag shape: $tag" >&2
  exit 1
fi
