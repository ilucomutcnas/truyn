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

exec bash "$(dirname "$0")/class-c-final-acceptance.sh" "$@"
