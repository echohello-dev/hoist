#!/usr/bin/env bash
set -euo pipefail

manifest="${CALVER_MANIFEST:-$MISE_PROJECT_ROOT/.release-please-manifest.json}"
calendar="${CALVER_DATE:-$(date -u +%Y-%m)}"

if [[ ! "$calendar" =~ ^([0-9]{4})-([0-9]{2})$ ]]; then
  echo "CALVER_DATE must use YYYY-MM" >&2
  exit 1
fi

year="${BASH_REMATCH[1]}"
month=$((10#${BASH_REMATCH[2]}))
patch=-1

while IFS= read -r version; do
  if [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    version_year="${BASH_REMATCH[1]}"
    version_month="${BASH_REMATCH[2]}"
    version_patch="${BASH_REMATCH[3]}"

    if (( version_year > year || (version_year == year && version_month > month) )); then
      echo "Manifest version $version is ahead of calendar $year.$month" >&2
      exit 1
    fi

    if (( version_year == year && version_month == month && version_patch > patch )); then
      patch="$version_patch"
    fi
  fi
done < <(jq -r '.[]' "$manifest")

version="$year.$month.$((patch + 1))"
echo "$version"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "version=$version" >> "$GITHUB_OUTPUT"
fi
