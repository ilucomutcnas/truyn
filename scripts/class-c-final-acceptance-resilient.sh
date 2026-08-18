#!/usr/bin/env bash
set -Eeuo pipefail

# GitHub-hosted Azure CLI processes can occasionally fail before issuing the
# control-plane request (for example, a Python import/module-lock crash). The
# Class C gate must distinguish that runner/tooling noise from a TRUYN network
# result, while remaining fail-closed on persistent failures.
: "${TRUYN_AZ_CLI_RETRIES:=4}"
export TRUYN_AZ_CLI_RETRIES

az() {
  local attempt=1 rc=0
  while true; do
    if command az "$@"; then
      return 0
    else
      rc=$?
    fi
    if (( attempt >= TRUYN_AZ_CLI_RETRIES )); then
      return "$rc"
    fi
    echo "TRUYN_AZ_CLI_TRANSIENT_RETRY attempt=${attempt} max=${TRUYN_AZ_CLI_RETRIES}" >&2
    sleep $((attempt * 2))
    attempt=$((attempt + 1))
  done
}
export -f az

# Ubuntu's command-not-found APT post-hook is irrelevant to the ephemeral
# benchmark guests and can fail independently when mirror metadata is briefly
# inconsistent. Patch only the generated guest bootstrap so that this optional
# hook cannot turn a package-manager metadata race into a TRUYN network result.
base_script="$(dirname "$0")/class-c-final-acceptance.sh"
patched_script="$(mktemp)"
trap 'rm -f "$patched_script"' EXIT
python3 - "$base_script" "$patched_script" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text()
needle = "s = s.replace('npm install --ignore-scripts --no-audit --no-fund', 'npm install --no-audit --no-fund')"
if needle not in src:
    raise SystemExit('Class C patch anchor missing')
injection = needle + "\ns = s.replace('apt-get update -qq', 'rm -f /etc/apt/apt.conf.d/50command-not-found\\napt-get update -qq')"
src = src.replace(needle, injection, 1)
Path(sys.argv[2]).write_text(src)
PY

exec bash "$patched_script" "$@"
