#!/usr/bin/env bash
set -uo pipefail

: "${AZURE_RG:?AZURE_RG is required}"
: "${AZURE_VIDEO_LOCATION:?AZURE_VIDEO_LOCATION is required}"
: "${AZURE_SUBSCRIPTION_ID_VALUE:?AZURE_SUBSCRIPTION_ID_VALUE is required}"
mkdir -p smoke-artifacts/video

suffix="$(printf '%s' "$AZURE_SUBSCRIPTION_ID_VALUE" | sha256sum | cut -c1-10)"
account="truynvid${suffix}"
deployment="truyn-sora"

echo "AZURE_VIDEO_ACCOUNT=$account" >> "$GITHUB_ENV"
echo "AZURE_VIDEO_DEPLOYMENT=$deployment" >> "$GITHUB_ENV"

if ! az cognitiveservices account show -g "$AZURE_RG" -n "$account" >/dev/null 2>&1; then
  if ! az cognitiveservices account create -g "$AZURE_RG" -n "$account" -l "$AZURE_VIDEO_LOCATION" --kind OpenAI --sku S0 --custom-domain "$account" --yes >/tmp/video-account.out 2>/tmp/video-account.err; then
    jq -n '{ok:false,modality:"video",provider:"azure-openai-video",status:"blocked_access",stage:"account"}' > smoke-artifacts/video/azure-video.json
    exit 0
  fi
fi

endpoint="$(az cognitiveservices account show -g "$AZURE_RG" -n "$account" --query properties.endpoint -o tsv)"
key="$(az cognitiveservices account keys list -g "$AZURE_RG" -n "$account" --query key1 -o tsv)"
[[ -n "$endpoint" && -n "$key" ]] || { echo 'Azure video account endpoint/key unavailable' >&2; exit 1; }
echo "AZURE_VIDEO_ENDPOINT=$endpoint" >> "$GITHUB_ENV"
echo "::add-mask::$key"
echo "AZURE_VIDEO_API_KEY=$key" >> "$GITHUB_ENV"

az cognitiveservices account list-models -g "$AZURE_RG" -n "$account" -o json > /tmp/video-models.json
entry="$(jq -c '[.[] | select(((.name // .model.name // "") | ascii_downcase) == "sora-2")][0] // empty' /tmp/video-models.json)"
if [[ -z "$entry" ]]; then
  entry="$(jq -c '[.[] | select(((.name // .model.name // "") | ascii_downcase) == "sora")][0] // empty' /tmp/video-models.json)"
fi
if [[ -z "$entry" ]]; then
  jq -n '{ok:false,modality:"video",provider:"azure-openai-video",status:"blocked_access",stage:"catalog",requested:["sora-2","sora"]}' > smoke-artifacts/video/azure-video.json
  exit 0
fi

model="$(jq -r '.name // .model.name' <<<"$entry")"
version="$(jq -r '.version // .model.version // empty' <<<"$entry")"
format="$(jq -r '.format // .model.format // "OpenAI"' <<<"$entry")"
sku="$(jq -r '[.skus[]?.name | select(.=="GlobalStandard" or .=="Standard")][0] // "GlobalStandard"' <<<"$entry")"
echo "AZURE_VIDEO_MODEL=$model" >> "$GITHUB_ENV"

if ! az cognitiveservices account deployment show -g "$AZURE_RG" -n "$account" --deployment-name "$deployment" >/dev/null 2>&1; then
  args=(cognitiveservices account deployment create -g "$AZURE_RG" -n "$account" --deployment-name "$deployment" --model-name "$model" --model-format "$format" --sku-name "$sku" --sku-capacity 1)
  [[ -n "$version" ]] && args+=(--model-version "$version")
  if ! az "${args[@]}" >/tmp/video-deploy.out 2>/tmp/video-deploy.err; then
    jq -n --arg requested "$model" '{ok:false,modality:"video",provider:"azure-openai-video",status:"blocked_access",stage:"deployment",requested:$requested}' > smoke-artifacts/video/azure-video.json
    exit 0
  fi
fi

echo 'AZURE_VIDEO_READY=true' >> "$GITHUB_ENV"
