#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

OWNER_SECRET_NAME="${TRUYN_OWNER_IDENTITY_SECRET_NAME:-benchmark-requester-identity}"
ARTIFACT_CONTAINER="${TRUYN_AZURE_ARTIFACT_CONTAINER:-artifacts}"

log() { printf '%s\n' "$1"; }
mask() { printf '::add-mask::%s\n' "$1"; }

node_id_from_b64() {
  printf '%s' "$1" | node --input-type=module -e "
    import { nodeIdFromPublicKey } from './core/protocol/index.js';
    let data=''; for await (const chunk of process.stdin) data += chunk;
    const identity=JSON.parse(Buffer.from(data.trim(),'base64').toString('utf8'));
    if (!identity.publicKeyPem || !identity.privateKeyPem) process.exit(2);
    const computed=nodeIdFromPublicKey(identity.publicKeyPem);
    if (identity.nodeId && identity.nodeId !== computed) process.exit(3);
    process.stdout.write(computed);
  "
}

new_identity_b64() {
  node --input-type=module -e "import { createIdentity } from './core/identity/index.js'; process.stdout.write(Buffer.from(JSON.stringify(createIdentity())).toString('base64'));"
}

owner_id="$(jq -r '.nodeId // empty' config/owner-benchmark.json)"
[[ "$owner_id" == truyn:node:* ]] || { log 'OWNER_BENCHMARK_CONFIG=invalid'; exit 1; }
[[ "$(jq -r '.access // empty' config/owner-benchmark.json)" == 'owner-only' ]] || { log 'OWNER_BENCHMARK_ACCESS=invalid'; exit 1; }

# Discover the existing relay instead of publishing operational resource names.
az containerapp list -o json > /tmp/truyn-containerapps.json
relay_json="$(jq -c '[.[] | select(any(.properties.template.containers[0].env[]?; .name == "TRUYN_ROLE" and .value == "relay"))][0] // empty' /tmp/truyn-containerapps.json)"
[[ -n "$relay_json" ]] || { log 'TRUYN_RELAY_DISCOVERY=missing'; exit 1; }
resource_group="$(jq -r '.resourceGroup' <<<"$relay_json")"
relay_app="$(jq -r '.name' <<<"$relay_json")"
environment_id="$(jq -r '.properties.environmentId // empty' <<<"$relay_json")"
[[ -n "$resource_group" && -n "$relay_app" && -n "$environment_id" ]] || { log 'TRUYN_RELAY_DISCOVERY=incomplete'; exit 1; }
environment_name="${environment_id##*/}"
location="$(az containerapp env show -g "$resource_group" -n "$environment_name" --query location -o tsv)"

subscription_id="$(az account show --query id -o tsv)"
subscription_hash="$(printf '%s' "$subscription_id" | sha256sum | cut -c1-10)"
short_hash="${subscription_hash:0:6}"

# Locate the private vault by capability, never by a committed resource name.
vault_name=''
while IFS= read -r candidate; do
  [[ -n "$candidate" ]] || continue
  if az keyvault secret show --vault-name "$candidate" --name "$OWNER_SECRET_NAME" >/dev/null 2>&1; then
    vault_name="$candidate"
    break
  fi
done < <(az keyvault list --query '[].name' -o tsv)
[[ -n "$vault_name" ]] || { log 'OWNER_IDENTITY_VAULT=not_found'; exit 1; }

owner_identity_b64="$(az keyvault secret show --vault-name "$vault_name" --name "$OWNER_SECRET_NAME" --query value -o tsv)"
mask "$owner_identity_b64"
private_owner_id="$(node_id_from_b64 "$owner_identity_b64")"
[[ "$private_owner_id" == "$owner_id" ]] || { log 'OWNER_IDENTITY_CONFIG=mismatch'; exit 1; }
log 'OWNER_IDENTITY_CONFIG=verified'

aliases=(gpt grok deepseek llama mistral kimi gpt-image gemini)
declare -A identity_b64 provider_node_id
for alias in "${aliases[@]}"; do
  secret_name="owner-provider-${alias}-identity"
  value="$(az keyvault secret show --vault-name "$vault_name" --name "$secret_name" --query value -o tsv 2>/dev/null || true)"
  if [[ -z "$value" ]]; then
    value="$(new_identity_b64)"
    mask "$value"
    az keyvault secret set --vault-name "$vault_name" --name "$secret_name" --value "$value" >/dev/null
  else
    mask "$value"
  fi
  identity_b64[$alias]="$value"
  provider_node_id[$alias]="$(node_id_from_b64 "$value")"
  [[ "${provider_node_id[$alias]}" == truyn:node:* ]] || { log "PROVIDER_IDENTITY_INVALID=$alias"; exit 1; }
done
log 'PROVIDER_IDENTITIES=stable'

# Build a private inventory of existing AI deployments.
: > /tmp/truyn-ai-deployments.ndjson
while IFS= read -r account; do
  [[ -n "$account" ]] || continue
  endpoint="$(az cognitiveservices account show -g "$resource_group" -n "$account" --query properties.endpoint -o tsv 2>/dev/null || true)"
  account_id="$(az cognitiveservices account show -g "$resource_group" -n "$account" --query id -o tsv 2>/dev/null || true)"
  [[ -n "$endpoint" && -n "$account_id" ]] || continue
  if az cognitiveservices account deployment list -g "$resource_group" -n "$account" -o json > /tmp/deployments.json 2>/dev/null; then
    jq -c --arg account "$account" --arg endpoint "$endpoint" --arg accountId "$account_id" '
      .[] | {
        account:$account,
        endpoint:$endpoint,
        accountId:$accountId,
        deployment:(.name // ""),
        model:(.properties.model.name // .model.name // "")
      } | .modelLower=(.model|ascii_downcase)
    ' /tmp/deployments.json >> /tmp/truyn-ai-deployments.ndjson
  fi
done < <(az cognitiveservices account list -g "$resource_group" --query '[].name' -o tsv)

pick_model() {
  local alias="$1" exact="$2" contains="$3"
  local row=''
  if [[ -n "$exact" ]]; then
    row="$(jq -sc --arg exact "$exact" '[.[] | select(.modelLower == ($exact|ascii_downcase))][0] // empty' /tmp/truyn-ai-deployments.ndjson)"
  fi
  if [[ -z "$row" || "$row" == 'null' ]]; then
    row="$(jq -sc --arg token "$contains" --arg alias "$alias" '
      [.[] | select(.modelLower | contains($token|ascii_downcase))
        | select(($alias != "gpt") or ((.modelLower|contains("image")|not) and (.modelLower|contains("sora")|not)))]
      | .[0] // empty
    ' /tmp/truyn-ai-deployments.ndjson)"
  fi
  [[ -n "$row" && "$row" != 'null' ]] || { log "AZURE_MODEL_DEPLOYMENT_MISSING=$alias"; exit 1; }
  printf '%s' "$row"
}

declare -A endpoint deployment account_id
for spec in \
  'gpt|gpt-4.1-mini|gpt' \
  'grok||grok' \
  'deepseek||deepseek' \
  'llama||llama' \
  'mistral||mistral' \
  'kimi||kimi' \
  'gpt-image|gpt-image-1-mini|gpt-image'; do
  IFS='|' read -r alias exact contains <<<"$spec"
  row="$(pick_model "$alias" "$exact" "$contains")"
  endpoint[$alias]="$(jq -r '.endpoint' <<<"$row")"
  deployment[$alias]="$(jq -r '.deployment' <<<"$row")"
  account_id[$alias]="$(jq -r '.accountId' <<<"$row")"
done
log 'AZURE_MODEL_DEPLOYMENTS=resolved'

# Reuse the existing registry; the production relay already depends on it.
acr_name="$(az acr list -g "$resource_group" --query '[0].name' -o tsv)"
[[ -n "$acr_name" ]] || { log 'AZURE_ACR=missing'; exit 1; }
acr_server="$(az acr show -g "$resource_group" -n "$acr_name" --query loginServer -o tsv)"
acr_id="$(az acr show -g "$resource_group" -n "$acr_name" --query id -o tsv)"

identity_name="truyn-owner-${short_hash}"
if ! az identity show -g "$resource_group" -n "$identity_name" >/dev/null 2>&1; then
  az identity create -g "$resource_group" -n "$identity_name" -l "$location" >/dev/null
fi
runtime_identity_id="$(az identity show -g "$resource_group" -n "$identity_name" --query id -o tsv)"
runtime_principal_id="$(az identity show -g "$resource_group" -n "$identity_name" --query principalId -o tsv)"
runtime_client_id="$(az identity show -g "$resource_group" -n "$identity_name" --query clientId -o tsv)"

storage_name="truynart${subscription_hash}"
if ! az storage account show -g "$resource_group" -n "$storage_name" >/dev/null 2>&1; then
  az storage account create -g "$resource_group" -n "$storage_name" -l "$location" --sku Standard_LRS --kind StorageV2 >/dev/null
fi
storage_id="$(az storage account show -g "$resource_group" -n "$storage_name" --query id -o tsv)"
storage_key="$(az storage account keys list -g "$resource_group" -n "$storage_name" --query '[0].value' -o tsv)"
mask "$storage_key"
az storage container create --name "$ARTIFACT_CONTAINER" --account-name "$storage_name" --account-key "$storage_key" >/dev/null

az role assignment create --assignee-object-id "$runtime_principal_id" --assignee-principal-type ServicePrincipal --role AcrPull --scope "$acr_id" >/dev/null 2>&1 || true
az role assignment create --assignee-object-id "$runtime_principal_id" --assignee-principal-type ServicePrincipal --role 'Storage Blob Data Contributor' --scope "$storage_id" >/dev/null 2>&1 || true

# AI accounts may overlap; grant once per unique resource.
printf '%s\n' "${account_id[@]}" | sort -u | while IFS= read -r ai_id; do
  [[ -n "$ai_id" ]] || continue
  az role assignment create --assignee-object-id "$runtime_principal_id" --assignee-principal-type ServicePrincipal --role 'Cognitive Services User' --scope "$ai_id" >/dev/null 2>&1 || true
  az role assignment create --assignee-object-id "$runtime_principal_id" --assignee-principal-type ServicePrincipal --role 'Cognitive Services OpenAI User' --scope "$ai_id" >/dev/null 2>&1 || true
done

image_tag="owner-fleet:${GITHUB_SHA}"
az acr build -r "$acr_name" -t "$image_tag" . --no-logs >/dev/null
runtime_image="${acr_server}/${image_tag}"
log 'AZURE_OWNER_IMAGE=built'

provider_ids_csv="$(printf '%s\n' "${provider_node_id[gpt]}" "${provider_node_id[grok]}" "${provider_node_id[deepseek]}" "${provider_node_id[llama]}" "${provider_node_id[mistral]}" "${provider_node_id[kimi]}" "${provider_node_id[gpt-image]}" "${provider_node_id[gemini]}" | paste -sd, -)"

# Update the existing relay to the fresh hardened runtime and closed allowlists.
az containerapp update -g "$resource_group" -n "$relay_app" \
  --image "$runtime_image" \
  --set-env-vars \
    TRUYN_ROLE=relay \
    "TRUYN_ALLOWED_NODE_IDS=$provider_ids_csv" \
    "TRUYN_TRUSTED_REQUESTER_NODE_IDS=$owner_id" \
    TRUYN_PRIVATE_DIAGNOSTICS=0 \
  --min-replicas 1 --max-replicas 1 >/dev/null

relay_fqdn="$(az containerapp show -g "$resource_group" -n "$relay_app" --query properties.configuration.ingress.fqdn -o tsv)"
[[ -n "$relay_fqdn" ]] || { log 'TRUYN_RELAY_FQDN=missing'; exit 1; }
relay_origin="https://${relay_fqdn}"
for attempt in $(seq 1 40); do
  if curl -fsS "${relay_origin}/health" | jq -e '.ok == true and .protocol == "TRUYN/1"' >/dev/null; then break; fi
  [[ "$attempt" -lt 40 ]] || { log 'TRUYN_RELAY_HEALTH=failed'; exit 1; }
  sleep 3
done
log 'TRUYN_RELAY_ACL=ready'

ensure_app() {
  local alias="$1" provider="$2" capabilities="$3" vendor="$4" family="$5"
  local app="truyn-own-${alias}-${short_hash}"
  local secret_name='provider-identity'
  local provider_identity="${identity_b64[$alias]}"
  local -a envs
  envs=(
    TRUYN_ROLE=provider
    "TRUYN_PROVIDER=$provider"
    "TRUYN_CAPABILITIES=$capabilities"
    "TRUYN_RELAY=$relay_origin"
    TRUYN_PROVIDER_ACCESS_MODE=owner-only
    "TRUYN_ALLOWED_REQUESTER_IDS=$owner_id"
    "AZURE_CLIENT_ID=$runtime_client_id"
  )

  case "$alias" in
    gpt)
      envs+=("AZURE_OPENAI_ENDPOINT=${endpoint[$alias]}" "AZURE_OPENAI_DEPLOYMENT=${deployment[$alias]}") ;;
    gpt-image)
      envs+=("AZURE_IMAGE_ENDPOINT=${endpoint[$alias]}" "AZURE_IMAGE_DEPLOYMENT=${deployment[$alias]}" "TRUYN_AZURE_ARTIFACT_ACCOUNT=$storage_name" "TRUYN_AZURE_ARTIFACT_CONTAINER=$ARTIFACT_CONTAINER") ;;
    *)
      envs+=("AZURE_FOUNDRY_ENDPOINT=${endpoint[$alias]}" "AZURE_FOUNDRY_DEPLOYMENT=${deployment[$alias]}" "TRUYN_MODEL_VENDOR=$vendor" "TRUYN_MODEL_FAMILY=$family") ;;
  esac

  if ! az containerapp show -g "$resource_group" -n "$app" >/dev/null 2>&1; then
    az containerapp create -g "$resource_group" -n "$app" \
      --environment "$environment_name" \
      --image "$runtime_image" \
      --target-port 8080 --ingress internal \
      --min-replicas 0 --max-replicas 1 \
      --user-assigned "$runtime_identity_id" \
      --registry-server "$acr_server" --registry-identity "$runtime_identity_id" \
      --env-vars TRUYN_ROLE=provider >/dev/null
  fi

  az containerapp secret set -g "$resource_group" -n "$app" --secrets "$secret_name=$provider_identity" >/dev/null
  envs+=("TRUYN_IDENTITY_B64=secretref:$secret_name")
  az containerapp update -g "$resource_group" -n "$app" \
    --image "$runtime_image" --set-env-vars "${envs[@]}" --min-replicas 1 --max-replicas 1 >/dev/null

  app_json="$(az containerapp show -g "$resource_group" -n "$app" -o json)"
  env_value() { jq -r --arg n "$1" '.properties.template.containers[0].env[]? | select(.name == $n) | .value // empty' <<<"$app_json" | head -n1; }
  secret_ref="$(jq -r '.properties.template.containers[0].env[]? | select(.name == "TRUYN_IDENTITY_B64") | .secretRef // empty' <<<"$app_json" | head -n1)"
  [[ "$(env_value TRUYN_PROVIDER_ACCESS_MODE)" == 'owner-only' ]] || { log "AZURE_PROVIDER_ACL_FAILED=$alias"; exit 1; }
  [[ "$(env_value TRUYN_ALLOWED_REQUESTER_IDS)" == "$owner_id" ]] || { log "AZURE_PROVIDER_ALLOWLIST_FAILED=$alias"; exit 1; }
  [[ "$secret_ref" == "$secret_name" ]] || { log "AZURE_PROVIDER_IDENTITY_BINDING_FAILED=$alias"; exit 1; }
  [[ "$(jq -r '.properties.provisioningState // empty' <<<"$app_json")" == 'Succeeded' ]] || { log "AZURE_PROVIDER_PROVISIONING_FAILED=$alias"; exit 1; }
  log "AZURE_PROVIDER_READY=$alias"
}

ensure_app gpt azure-openai 'reasoning.general;owner.benchmark.gpt' openai gpt
ensure_app grok azure-foundry 'reasoning.general;owner.benchmark.grok' xai grok
ensure_app deepseek azure-foundry 'reasoning.general;owner.benchmark.deepseek' deepseek deepseek
ensure_app llama azure-foundry 'reasoning.general;owner.benchmark.llama' meta llama
ensure_app mistral azure-foundry 'reasoning.general;owner.benchmark.mistral' mistral mistral
ensure_app kimi azure-foundry 'reasoning.general;owner.benchmark.kimi' moonshot kimi
ensure_app gpt-image azure-openai-image 'media.image.generate;owner.benchmark.gpt-image' openai gpt-image

# Export only ephemeral runtime values for later steps in this workflow.
{
  printf 'TRUYN_RELAY_ORIGIN=%s\n' "$relay_origin"
  printf 'TRUYN_OWNER_IDENTITY_B64=%s\n' "$owner_identity_b64"
  printf 'TRUYN_OWNER_NODE_ID=%s\n' "$owner_id"
  printf 'TRUYN_GEMINI_IDENTITY_B64=%s\n' "${identity_b64[gemini]}"
  printf 'TRUYN_GEMINI_NODE_ID=%s\n' "${provider_node_id[gemini]}"
} >> "$GITHUB_ENV"

log 'AZURE_OWNER_FLEET=protected-and-provisioned'
