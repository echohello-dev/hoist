#!/usr/bin/env bash
set -euo pipefail

: "${CALVER_VERSION:?CALVER_VERSION is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

branch="release-please--branches--main"
before_sha=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$branch" \
  --json headRefOid --jq '.[0].headRefOid // empty')

release-please release-pr \
  --config-file release-please-config.json \
  --manifest-file .release-please-manifest.json \
  --release-as "$CALVER_VERSION" \
  --repo-url "$GITHUB_REPOSITORY" \
  --target-branch main \
  --token "$GH_TOKEN"

after_sha=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$branch" \
  --json headRefOid --jq '.[0].headRefOid // empty')

if [[ -n "$after_sha" && "$after_sha" != "$before_sha" ]]; then
  echo "prs_created=true" >> "$GITHUB_OUTPUT"
else
  echo "prs_created=false" >> "$GITHUB_OUTPUT"
fi
