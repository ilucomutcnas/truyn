#!/usr/bin/env bash
set -Eeuo pipefail

sha="${1:-HEAD}"
git cat-file -e "${sha}^{commit}"

allowed=$'.github/workflows/.gitkeep\n.github/workflows/ci.yml'
actual="$(git ls-tree -r --name-only "$sha" -- .github/workflows | sort)"

if [[ "$actual" != "$allowed" ]]; then
  echo "TRUYN_TESTED_COMMIT_SECURITY=FAIL sha=${sha}" >&2
  echo "Expected public workflow allowlist:" >&2
  printf '%s\n' "$allowed" >&2
  echo "Actual:" >&2
  printf '%s\n' "$actual" >&2
  exit 1
fi

echo "TRUYN_TESTED_COMMIT_SECURITY=PASS sha=${sha}"
