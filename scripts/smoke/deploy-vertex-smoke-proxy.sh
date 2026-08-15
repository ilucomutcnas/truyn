#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID_VALUE:?GCP_PROJECT_ID_VALUE is required}"
: "${GCP_RUNTIME_SA_VALUE:?GCP_RUNTIME_SA_VALUE is required}"
: "${GCP_PROXY_REGION:?GCP_PROXY_REGION is required}"
: "${GCP_AR_REPO:?GCP_AR_REPO is required}"
: "${GCP_PROXY_SERVICE:?GCP_PROXY_SERVICE is required}"

proxy_token="$(openssl rand -hex 32)"
echo "::add-mask::$proxy_token"
registry="${GCP_PROXY_REGION}-docker.pkg.dev"
image="${registry}/${GCP_PROJECT_ID_VALUE}/${GCP_AR_REPO}/vertex-smoke:${GITHUB_SHA}"
gcloud auth configure-docker "$registry" --quiet
docker build -f scripts/smoke/Dockerfile.vertex-proxy -t "$image" .
docker push "$image"

upstream="${VERTEX_UPSTREAM_ORIGIN:-https://aiplatform.googleapis.com}"
gcloud run deploy "$GCP_PROXY_SERVICE" \
  --project="$GCP_PROJECT_ID_VALUE" --region="$GCP_PROXY_REGION" \
  --image="$image" --service-account="$GCP_RUNTIME_SA_VALUE" \
  --port=8080 --min=0 --max=1 --cpu=1 --memory=512Mi \
  --set-env-vars="SMOKE_PROXY_TOKEN=${proxy_token},REAL_VERTEX_API_ENDPOINT=${upstream}" \
  --no-invoker-iam-check --quiet

proxy_url="$(gcloud run services describe "$GCP_PROXY_SERVICE" --project="$GCP_PROJECT_ID_VALUE" --region="$GCP_PROXY_REGION" --format='value(status.url)')"
for attempt in $(seq 1 30); do
  if curl -fsS -H "Authorization: Bearer ${proxy_token}" "${proxy_url}/health" | jq -e '.ok == true' >/dev/null; then break; fi
  [[ "$attempt" -lt 30 ]] || exit 1
  sleep 2
done

echo "VERTEX_SMOKE_ENDPOINT=$proxy_url" >> "$GITHUB_ENV"
echo "::add-mask::$proxy_token"
echo "VERTEX_SMOKE_TOKEN=$proxy_token" >> "$GITHUB_ENV"
