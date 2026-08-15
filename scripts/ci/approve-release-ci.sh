#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

head_sha=$(gh pr list --repo "$GITHUB_REPOSITORY" \
  --head release-please--branches--main \
  --json headRefOid --jq '.[0].headRefOid')

for _ in {1..12}; do
  run_id=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow CI \
    --branch release-please--branches--main --event pull_request --limit 5 \
    --json databaseId,conclusion,headSha \
    --jq "[.[] | select(.headSha == \"$head_sha\" and .conclusion == \"action_required\")][0].databaseId // empty")

  if [[ -n "$run_id" ]]; then
    actor=$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}" --jq '.actor.login')
    [[ "$actor" == "github-actions[bot]" ]]
    gh api --method POST "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/approve"
    exit 0
  fi

  sleep 5
done

echo "Timed out waiting for release PR CI approval" >&2
exit 1
