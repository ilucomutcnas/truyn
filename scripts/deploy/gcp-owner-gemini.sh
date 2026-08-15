#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL:?GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL is required}"
: "${GCP_REGION_CONFIGURED:?GCP_REGION_CONFIGURED is required}"
: "${TRUYN_RELAY_ORIGIN:?TRUYN_RELAY_ORIGIN is required}"
: "${TRUYN_OWNER_NODE_ID:?TRUYN_OWNER_NODE_ID is required}"
: "${TRUYN_GEMINI_IDENTITY_B64:?TRUYN_GEMINI_IDENTITY_B64 is required}"
: "${TRUYN_GEMINI_NODE_ID:?TRUYN_GEMINI_NODE_ID is required}"

log() { printf '%s\n' "$1"; }
mask() { printf '::add-mask::%s\n' "$1"; }

region="$(printf '%s' "$GCP_REGION_CONFIGURED" | grep -oE '[a-z]+-[a-z0-9]+[0-9]' | head -n1 || true)"
[[ -n "$region" ]] || { log 'GCP_RUNTIME_REGION=invalid'; exit 1; }
project_hash="$(printf '%s' "$GCP_PROJECT_ID" | sha256sum | cut -c1-8)"
service="truyn-own-gemini-${project_hash}"
repo=''

mask "$TRUYN_GEMINI_IDENTITY_B64"
computed_node_id="$(printf '%s' "$TRUYN_GEMINI_IDENTITY_B64" | node --input-type=module -e "
  import { nodeIdFromPublicKey } from './core/protocol/index.js';
  let data=''; for await (const chunk of process.stdin) data += chunk;
  const identity=JSON.parse(Buffer.from(data.trim(),'base64').toString('utf8'));
  if (!identity.publicKeyPem || !identity.privateKeyPem) process.exit(2);
  process.stdout.write(nodeIdFromPublicKey(identity.publicKeyPem));
")"
[[ "$computed_node_id" == "$TRUYN_GEMINI_NODE_ID" ]] || { log 'GCP_GEMINI_IDENTITY=mismatch'; exit 1; }

# Reuse a Docker repository in the configured region; create a deterministic one only if needed.
repo="$(gcloud artifacts repositories list --project="$GCP_PROJECT_ID" --location="$region" --filter='format=DOCKER' --format='value(name)' | head -n1 || true)"
if [[ -z "$repo" ]]; then
  repo="owner-fleet-${project_hash}"
  gcloud artifacts repositories create "$repo" \
    --project="$GCP_PROJECT_ID" --location="$region" \
    --repository-format=docker --description='TRUYN protected owner runtimes' --quiet >/dev/null
else
  repo="${repo##*/}"
fi
[[ -n "$repo" ]] || { log 'GCP_ARTIFACT_REPOSITORY=missing'; exit 1; }

registry="${region}-docker.pkg.dev"
image="${registry}/${GCP_PROJECT_ID}/${repo}/owner-gemini:${GITHUB_SHA}"
gcloud auth configure-docker "$registry" --quiet >/dev/null
docker build -t "$image" . >/dev/null
docker push "$image" >/dev/null
log 'GCP_OWNER_GEMINI_IMAGE=built'

# The service has no public ingress. It only maintains an outbound signed TRUYN connection to the relay.
gcloud run deploy "$service" \
  --project="$GCP_PROJECT_ID" \
  --region="$region" \
  --image="$image" \
  --service-account="$GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL" \
  --port=8080 \
  --min=1 --max=1 \
  --no-cpu-throttling \
  --cpu=1 --memory=512Mi \
  --ingress=internal \
  --set-env-vars="TRUYN_ROLE=provider,TRUYN_PROVIDER=vertex-gemini,TRUYN_CAPABILITIES=reasoning.general;owner.benchmark.gemini,TRUYN_RELAY=${TRUYN_RELAY_ORIGIN},TRUYN_PROVIDER_ACCESS_MODE=owner-only,TRUYN_ALLOWED_REQUESTER_IDS=${TRUYN_OWNER_NODE_ID},TRUYN_IDENTITY_B64=${TRUYN_GEMINI_IDENTITY_B64},GCP_PROJECT_ID=${GCP_PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-2.5-flash" \
  --quiet >/dev/null

service_json="$(gcloud run services describe "$service" --project="$GCP_PROJECT_ID" --region="$region" --format=json)"
env_value() {
  jq -r --arg n "$1" '.spec.template.spec.containers[0].env[]? | select(.name == $n) | .value // empty' <<<"$service_json" | head -n1
}
[[ "$(env_value TRUYN_PROVIDER_ACCESS_MODE)" == 'owner-only' ]] || { log 'GCP_GEMINI_ACL=failed'; exit 1; }
[[ "$(env_value TRUYN_ALLOWED_REQUESTER_IDS)" == "$TRUYN_OWNER_NODE_ID" ]] || { log 'GCP_GEMINI_ALLOWLIST=failed'; exit 1; }
deployed_identity="$(env_value TRUYN_IDENTITY_B64)"
mask "$deployed_identity"
deployed_node_id="$(printf '%s' "$deployed_identity" | node --input-type=module -e "
  import { nodeIdFromPublicKey } from './core/protocol/index.js';
  let data=''; for await (const chunk of process.stdin) data += chunk;
  const identity=JSON.parse(Buffer.from(data.trim(),'base64').toString('utf8'));
  process.stdout.write(nodeIdFromPublicKey(identity.publicKeyPem));
")"
[[ "$deployed_node_id" == "$TRUYN_GEMINI_NODE_ID" ]] || { log 'GCP_GEMINI_IDENTITY_STABILITY=failed'; exit 1; }
[[ "$(jq -r '.status.conditions[]? | select(.type == "Ready") | .status' <<<"$service_json" | head -n1)" == 'True' ]] || { log 'GCP_GEMINI_READY=failed'; exit 1; }

log 'GCP_OWNER_GEMINI=protected-and-ready'
