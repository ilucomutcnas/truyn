import { azureProviderHeaders, containerAppsManagedIdentityToken } from './common/azure-auth.js';
import { artifactFromBuffer, artifactResult } from './common/artifacts.js';
import { createAzureBlobArtifactStore } from './common/azure-blob-artifact-store.js';

export function createAzureFluxProvider({
  endpoint = process.env.AZURE_FLUX_ENDPOINT || process.env.AZURE_FOUNDRY_ENDPOINT,
  model = process.env.AZURE_FLUX_DEPLOYMENT || process.env.AZURE_FLUX_MODEL,
  apiKey = process.env.AZURE_FLUX_API_KEY || process.env.AZURE_FOUNDRY_API_KEY,
  capabilities = ['media.image.generate'],
  accessTokenProvider = containerAppsManagedIdentityToken,
  artifactStore,
  fetchImpl = fetch
} = {}) {
  if (!endpoint) throw new Error('Azure FLUX endpoint is required');
  if (!model) throw new Error('Azure FLUX model identifier is required');
  const store = artifactStore || createAzureBlobArtifactStore({ accessTokenProvider, fetchImpl });

  return {
    name: 'azure-flux-image-generate',
    version: '1',
    capabilities,
    async execute({ input, policy = {} }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const prompt = typeof input === 'string' ? input : input?.prompt || JSON.stringify(input);
      const request = { model, prompt, n: 1, size: providerOptions.size || '1024x1024' };
      const requestBody = JSON.stringify(request);
      const headers = await azureProviderHeaders({
        apiKey,
        accessTokenProvider,
        fetchImpl,
        resource: process.env.AZURE_FLUX_TOKEN_RESOURCE || 'https://ai.azure.com/'
      });
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/openai/v1/images/generations?api-version=preview`, {
        method: 'POST', headers, body: requestBody
      });
      const body = await response.json();
      if (!response.ok) throw new Error('Azure FLUX request failed');
      const generatedUrl = body?.data?.[0]?.url;
      if (!generatedUrl) throw new Error('Azure FLUX response contained no image URL');

      const artifactUrl = new URL(generatedUrl);
      if (artifactUrl.protocol !== 'https:') throw new Error('Azure FLUX returned an unsafe artifact URL');
      const imageResponse = await fetchImpl(artifactUrl);
      if (!imageResponse.ok) throw new Error('Azure FLUX artifact download failed');
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const mediaType = imageResponse.headers?.get?.('content-type')?.split(';')[0] || 'image/png';
      const extension = mediaType === 'image/jpeg' ? 'jpg' : 'png';
      const stored = await store.put(buffer, { mediaType, prefix: 'image/azure-flux', extension });
      const artifact = artifactFromBuffer(buffer, {
        mediaType,
        ref: stored.ref,
        provenance: { cloud: 'azure', vendor: 'black-forest-labs', family: 'flux', model },
        metadata: { size: request.size }
      });
      return artifactResult([artifact], {
        provider: 'azure-flux',
        cloud: 'azure',
        vendor: 'black-forest-labs',
        modelFamily: 'flux',
        model,
        modality: 'image',
        providerLatencyMs: Date.now() - startedAt,
        providerRequestBodyBytes: Buffer.byteLength(requestBody),
        providerResponseBodyBytes: Buffer.byteLength(JSON.stringify(body)),
        artifactBytes: artifact.bytes
      });
    }
  };
}
