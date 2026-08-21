#!/usr/bin/env bash

# Class D-100 acceptance-specific Azure RunCommand boundary.
#
# Safety contract:
# - never replay a guest script after Azure has admitted guest execution;
# - retry only explicit control-plane non-admission conditions;
# - RunCommand-busy uses bounded fixed waits;
# - HTTP 429 / Too Many Requests uses bounded exponential backoff;
# - all other non-zero results fail closed immediately.
truyn_class_d_remote() {
  local rg="$1" vm="$2" script="$3" enc remote_script
  local rc=0 out_file err_file
  local busy_attempt=1 throttle_attempt=1
  local busy_max="${TRUYN_AZ_RUN_COMMAND_BUSY_RETRIES:-12}"
  local busy_sleep="${TRUYN_AZ_RUN_COMMAND_BUSY_SLEEP_SECONDS:-10}"
  local throttle_max="${TRUYN_AZ_RUN_COMMAND_429_RETRIES:-6}"
  local throttle_base="${TRUYN_AZ_RUN_COMMAND_429_BASE_DELAY_SECONDS:-2}"
  local throttle_cap="${TRUYN_AZ_RUN_COMMAND_429_MAX_DELAY_SECONDS:-30}"
  local delay=0
  local guest_marker='TRUYN_GUEST_EXECUTION_ADMITTED=1'

  enc="$(printf '%s' "$script" | base64 -w0)"
  remote_script="echo ${guest_marker}; printf '%s' '$enc' | base64 -d >/tmp/truyn-d100-run.sh; chmod 700 /tmp/truyn-d100-run.sh; /bin/bash /tmp/truyn-d100-run.sh"
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  while true; do
    : >"$out_file"
    : >"$err_file"

    # Azure RunCommand may return stdout/stderr in more than one value element.
    # Preserve every message component: later elements can contain both the guest
    # admission marker and semantic campaign markers. Never rely on array order.
    if command az vm run-command invoke -g "$rg" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[].message' -o tsv --only-show-errors >"$out_file" 2>"$err_file"; then
      cat "$out_file"
      rm -f "$out_file" "$err_file"
      return 0
    else
      rc=$?
    fi

    # Once the guest marker is visible, execution was admitted. Any non-zero
    # is terminal and must never be replayed, even if stderr also mentions a
    # transient-looking condition.
    if grep -Fq "$guest_marker" "$out_file" || grep -Fq "$guest_marker" "$err_file"; then
      cat "$out_file" >&2
      cat "$err_file" >&2
      rm -f "$out_file" "$err_file"
      return "$rc"
    fi

    if grep -Fqi 'managed VM RunCommand extension execution is in progress' "$err_file" || \
       grep -Fqi 'Please wait for completion before invoking a run command' "$err_file"; then
      if (( busy_attempt >= busy_max )); then
        cat "$out_file" >&2
        cat "$err_file" >&2
        rm -f "$out_file" "$err_file"
        return "$rc"
      fi
      echo "TRUYN_AZ_RUN_COMMAND_BUSY_WAIT vm=${vm} attempt=${busy_attempt} max=${busy_max}" >&2
      sleep "$busy_sleep"
      busy_attempt=$((busy_attempt + 1))
      continue
    fi

    if [[ ! -s "$out_file" ]] && \
       grep -Eqi 'Too Many Requests|HTTP[^0-9]*429|status[^0-9]*429|\b429\b' "$err_file"; then
      if (( throttle_attempt >= throttle_max )); then
        cat "$out_file" >&2
        cat "$err_file" >&2
        rm -f "$out_file" "$err_file"
        return "$rc"
      fi

      if (( throttle_base > 0 )); then
        delay=$(( throttle_base * (1 << (throttle_attempt - 1)) ))
        (( delay > throttle_cap )) && delay="$throttle_cap"
      else
        delay=0
      fi
      echo "TRUYN_AZ_RUN_COMMAND_429_BACKOFF vm=${vm} attempt=${throttle_attempt} max=${throttle_max} delaySeconds=${delay}" >&2
      sleep "$delay"
      throttle_attempt=$((throttle_attempt + 1))
      continue
    fi

    # Ordinary guest/command non-zero is terminal for this invocation.
    # Fail closed immediately and never replay the guest script.
    cat "$out_file" >&2
    cat "$err_file" >&2
    rm -f "$out_file" "$err_file"
    return "$rc"
  done
}
