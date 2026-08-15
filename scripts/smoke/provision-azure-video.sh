#!/usr/bin/env bash
set -uo pipefail

: "${AZURE_RG:?AZURE_RG is required}"
: "${AZURE_SUBSCRIPTION_ID_VALUE:?AZURE_SUBSCRIPTION_ID_VALUE is required}"
mkdir -p smoke-artifacts/video

suffix="$(printf '%s' "$AZURE_SUBSCRIPTION_ID_VALUE" | sha256sum | cut -c1-8)"
deployment="truyn-sora"
attempts='[]'
selected_model=""
selected_region=""

record_attempt() {
  local region="$1" stage="$2" status="$3" model="$4" reason="$5"
  local tmp
  tmp="$(mktemp)"
  jq --arg region "$region" --arg stage "$stage" --arg status "$status" --arg model "$model" --arg reason "$reason" \
    '. + [({region:$region,stage:$stage,status:$status} + (if ($model|length)>0 then {model:$model} else {} end) + (if ($reason|length)>0 then {reason:$reason} else {} end))]' \
    <<<"$attempts" > "$tmp"
  attempts="$(cat "$tmp")"
  rm -f "$tmp"
}

try_region() {
  local region="$1"
  local region_tag="${region//[^a-z0-9]/}"
  local account="truynvid${region_tag:0:4}${suffix}"
  local model=""

  if ! az cognitiveservices account show -g "$AZURE_RG" -n "$account" >/dev/null 2>&1; then
    if ! az cognitiveservices account create -g "$AZURE_RG" -n "$account" -l "$region" --kind OpenAI --sku S0 --custom-domain "$account" --yes >/tmp/video-account.out 2>/tmp/video-account.err; then
      record_attempt "$region" "account" "blocked_access" "" "account_creation_denied"
      return 1
    fi
  fi

  local endpoint key
  endpoint="$(az cognitiveservices account show -g "$AZURE_RG" -n "$account" --query properties.endpoint -o tsv 2>/dev/null || true)"
  key="$(az cognitiveservices account keys list -g "$AZURE_RG" -n "$account" --query key1 -o tsv 2>/dev/null || true)"
  if [[ -z "$endpoint" || -z "$key" ]]; then
    record_attempt "$region" "account_credentials" "blocked_access" "" "endpoint_or_key_unavailable"
    return 1
  fi

  az cognitiveservices account list-models -g "$AZURE_RG" -n "$account" -o json > "/tmp/video-models-${region}.json"
  local entry
  entry="$(jq -c '[.[] | select(((.name // .model.name // "") | ascii_downcase) == "sora-2")][0] // empty' "/tmp/video-models-${region}.json")"
  if [[ -z "$entry" ]]; then
    entry="$(jq -c '[.[] | select(((.name // .model.name // "") | ascii_downcase) == "sora")][0] // empty' "/tmp/video-models-${region}.json")"
  fi
  if [[ -z "$entry" ]]; then
    record_attempt "$region" "catalog" "blocked_access" "" "sora_not_in_subscription_catalog"
    return 1
  fi

  model="$(jq -r '.name // .model.name' <<<"$entry")"
  local version format sku
  version="$(jq -r '.version // .model.version // empty' <<<"$entry")"
  format="$(jq -r '.format // .model.format // "OpenAI"' <<<"$entry")"
  sku="$(jq -r '[.skus[]?.name | select(.=="GlobalStandard" or .=="Standard")][0] // "GlobalStandard"' <<<"$entry")"

  if ! az cognitiveservices account deployment show -g "$AZURE_RG" -n "$account" --deployment-name "$deployment" >/dev/null 2>&1; then
    local args=(cognitiveservices account deployment create -g "$AZURE_RG" -n "$account" --deployment-name "$deployment" --model-name "$model" --model-format "$format" --sku-name "$sku" --sku-capacity 1)
    [[ -n "$version" ]] && args+=(--model-version "$version")
    if ! az "${args[@]}" >/tmp/video-deploy.out 2>/tmp/video-deploy.err; then
      record_attempt "$region" "deployment" "blocked_access" "$model" "deployment_or_entitlement_denied"
      return 1
    fi
  fi

  record_attempt "$region" "deployment" "ready" "$model" ""
  selected_model="$model"
  selected_region="$region"
  echo "AZURE_VIDEO_ACCOUNT=$account" >> "$GITHUB_ENV"
  echo "AZURE_VIDEO_DEPLOYMENT=$deployment" >> "$GITHUB_ENV"
  echo "AZURE_VIDEO_ENDPOINT=$endpoint" >> "$GITHUB_ENV"
  echo "::add-mask::$key"
  echo "AZURE_VIDEO_API_KEY=$key" >> "$GITHUB_ENV"
  echo "AZURE_VIDEO_MODEL=$model" >> "$GITHUB_ENV"
  echo "AZURE_VIDEO_REGION=$region" >> "$GITHUB_ENV"
  echo 'AZURE_VIDEO_READY=true' >> "$GITHUB_ENV"
  return 0
}

for region in eastus2 swedencentral; do
  if try_region "$region"; then
    jq -n --argjson attempts "$attempts" --arg region "$selected_region" --arg model "$selected_model" \
      '{ok:true,modality:"video",provider:"azure-openai-video",status:"ready",region:$region,model:$model,attempts:$attempts}' \
      > smoke-artifacts/video/azure-video-preflight.json
    exit 0
  fi
done

jq -n --argjson attempts "$attempts" \
  '{ok:false,modality:"video",provider:"azure-openai-video",status:"blocked_access",stage:"deployment_or_entitlement",attempts:$attempts}' \
  > smoke-artifacts/video/azure-video.json
exit 0
