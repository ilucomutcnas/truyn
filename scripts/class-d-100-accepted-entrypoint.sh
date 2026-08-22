#!/usr/bin/env bash
set -Eeuo pipefail

# Canonical accepted Class D-100 entrypoint.
#
# Never invoke class-d-100-final-acceptance.sh directly for an accepted run:
# the versioned chain carries the install diagnostics/readiness hardening that
# must remain coupled to the canonical predicates.
exec bash scripts/class-d-100-v13-acceptance.sh "$@"
