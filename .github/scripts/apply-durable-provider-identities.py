from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))


# GCP Cloud Run: keep the Ed25519 identity in Secret Manager and pin a numeric secret version.
gcp = '.github/workflows/cloud-poc-gcp-runtime.yml'
replace_once(
    gcp,
    '      GCP_SERVICE: truyn-gemini\n      TRUYN_PUBLIC_RELAY:',
    '      GCP_SERVICE: truyn-gemini\n      GCP_IDENTITY_SECRET: truyn-gemini-identity-b64\n      TRUYN_PUBLIC_RELAY:'
)
replace_once(
    gcp,
    "      - name: Verify relay backchannel origin\n        shell: bash\n        run: |",
    """      - name: Ensure durable Gemini node identity secret
        shell: bash
        run: |
          set -euo pipefail
          gcloud services enable secretmanager.googleapis.com --project="$GCP_PROJECT_ID_VALUE" --quiet
          if ! gcloud secrets describe "$GCP_IDENTITY_SECRET" --project="$GCP_PROJECT_ID_VALUE" >/dev/null 2>&1; then
            identity_b64="$(node --input-type=module -e \"import { createIdentity } from './core/identity/index.js'; process.stdout.write(Buffer.from(JSON.stringify(createIdentity())).toString('base64'));\")"
            echo "::add-mask::$identity_b64"
            printf '%s' "$identity_b64" | gcloud secrets create "$GCP_IDENTITY_SECRET" \\
              --project="$GCP_PROJECT_ID_VALUE" \\
              --replication-policy=automatic \\
              --data-file=- >/dev/null
            echo 'GCP_PROVIDER_IDENTITY_SECRET=created'
          else
            echo 'GCP_PROVIDER_IDENTITY_SECRET=existing'
          fi
          gcloud secrets add-iam-policy-binding "$GCP_IDENTITY_SECRET" \\
            --project="$GCP_PROJECT_ID_VALUE" \\
            --member="serviceAccount:${GCP_RUNTIME_SA_VALUE}" \\
            --role='roles/secretmanager.secretAccessor' \\
            --quiet >/dev/null
          version_path="$(gcloud secrets versions list "$GCP_IDENTITY_SECRET" \\
            --project="$GCP_PROJECT_ID_VALUE" \\
            --filter='state:ENABLED' --sort-by='~createTime' --limit=1 --format='value(name)')"
          [[ -n "$version_path" ]] || { echo 'GCP_PROVIDER_IDENTITY_VERSION=missing'; exit 1; }
          version="${version_path##*/}"
          [[ "$version" =~ ^[0-9]+$ ]] || { echo 'GCP_PROVIDER_IDENTITY_VERSION=invalid'; exit 1; }
          echo "GCP_IDENTITY_SECRET_VERSION=$version" >> "$GITHUB_ENV"
          echo "GCP_PROVIDER_IDENTITY_VERSION=$version"

      - name: Verify relay backchannel origin
        shell: bash
        run: |"""
)
replace_once(
    gcp,
    '            --set-env-vars="TRUYN_ROLE=provider,TRUYN_PROVIDER=vertex-gemini,TRUYN_CAPABILITIES=review,TRUYN_RELAY=${TRUYN_PROVIDER_RELAY_ORIGIN},GCP_PROJECT_ID=${GCP_PROJECT_ID_VALUE},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-2.5-flash" \\\n            --quiet',
    '            --set-env-vars="TRUYN_ROLE=provider,TRUYN_PROVIDER=vertex-gemini,TRUYN_CAPABILITIES=review,TRUYN_RELAY=${TRUYN_PROVIDER_RELAY_ORIGIN},GCP_PROJECT_ID=${GCP_PROJECT_ID_VALUE},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-2.5-flash" \\\n            --update-secrets="TRUYN_IDENTITY_B64=${GCP_IDENTITY_SECRET}:${GCP_IDENTITY_SECRET_VERSION}" \\\n            --quiet'
)
replace_once(
    gcp,
    "          echo 'GCP_CLOUD_RUN_READY=true'",
    """          identity_secret_version="$(gcloud run services describe "$GCP_SERVICE" --project="$GCP_PROJECT_ID_VALUE" --region="$GCP_RUNTIME_REGION" --format='value(spec.template.spec.containers[0].env[?name=TRUYN_IDENTITY_B64].valueFrom.secretKeyRef.key)')"
          [[ "$identity_secret_version" == "$GCP_IDENTITY_SECRET_VERSION" ]] || { echo 'GCP_PROVIDER_IDENTITY_BINDING=failed'; exit 1; }
          echo "GCP_PROVIDER_IDENTITY_BINDING=secret-version-${identity_secret_version}"
          echo 'GCP_CLOUD_RUN_READY=true'"""
)

# Azure Container Apps: keep the provider identity in an app-level secret and bind via secretref.
azure = '.github/workflows/cloud-poc-azure-runtime.yml'
replace_once(
    azure,
    '      AZURE_PROVIDER_APP: truyn-azure-gpt\n      AZURE_RUNTIME_IDENTITY:',
    '      AZURE_PROVIDER_APP: truyn-azure-gpt\n      AZURE_PROVIDER_IDENTITY_SECRET: truyn-provider-identity-b64\n      AZURE_RUNTIME_IDENTITY:'
)
replace_once(
    azure,
    "          echo \"AZURE_GPT_PUBLIC_RELAY=${TRUYN_PUBLIC_RELAY}\"",
    """          secret_count="$(az containerapp secret list -g "$AZURE_RG" -n "$AZURE_PROVIDER_APP" --query \"[?name=='$AZURE_PROVIDER_IDENTITY_SECRET'] | length(@)\" -o tsv)"
          if [[ "$secret_count" == "0" ]]; then
            identity_b64="$(node --input-type=module -e \"import { createIdentity } from './core/identity/index.js'; process.stdout.write(Buffer.from(JSON.stringify(createIdentity())).toString('base64'));\")"
            echo "::add-mask::$identity_b64"
            az containerapp secret set -g "$AZURE_RG" -n "$AZURE_PROVIDER_APP" \\
              --secrets "$AZURE_PROVIDER_IDENTITY_SECRET=$identity_b64" >/dev/null
            echo 'AZURE_PROVIDER_IDENTITY_SECRET=created'
          else
            echo 'AZURE_PROVIDER_IDENTITY_SECRET=existing'
          fi
          az containerapp update -g "$AZURE_RG" -n "$AZURE_PROVIDER_APP" \\
            --set-env-vars "TRUYN_IDENTITY_B64=secretref:$AZURE_PROVIDER_IDENTITY_SECRET" >/dev/null
          identity_secret_ref="$(az containerapp show -g "$AZURE_RG" -n "$AZURE_PROVIDER_APP" --query \"properties.template.containers[0].env[?name=='TRUYN_IDENTITY_B64'].secretRef | [0]\" -o tsv)"
          [[ "$identity_secret_ref" == "$AZURE_PROVIDER_IDENTITY_SECRET" ]] || { echo 'AZURE_PROVIDER_IDENTITY_BINDING=failed'; exit 1; }
          echo "AZURE_PROVIDER_IDENTITY_BINDING=$identity_secret_ref"
          echo "AZURE_GPT_PUBLIC_RELAY=${TRUYN_PUBLIC_RELAY}"""
)
