import { azureProviderHeaders, containerAppsManagedIdentityToken } from './common/azure-auth.js';
import { artifactFromBase64, artifactResult } from './common/artifacts.js';
import { createAzureBlobArtifactStore } from './common/azure-blob-artifact-store.js';

export function createAzureOpenAIImageProvider({
  endpoint = process.env.AZURE_IMAGE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
  model = process.env.AZURE_IMAGE_DEPLOYMENT || process.env.AZURE_IMAGE_MODEL,
  apiKey = process.env.AZURE_IMAGE_API_KEY || process.env.AZURE_OPENAI_API_KEY,
  capabilities = ['media.image.generate'],
  accessTokenProvider = containerAppsManagedIdentityToken,
  artifactStore,
  fetchImpl = fetch
} = {}) {
  if (!endpoint) throw new Error('AZURE_IMAGE_ENDPOINT or AZURE_OPENAI_ENDPOINT is required');
  if (!model) throw new Error('AZURE_IMAGE_DEPLOYMENT or AZURE_IMAGE_MODEL is required');
  const store = artifactStore || createAzureBlobArtifactStore({ accessTokenProvider, fetchImpl });

  return {
    name: 'azure-openai-image-generate',
    version: '1',
    capabilities,
    async execute({ input, policy = {} }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const prompt = typeof input === 'string' ? input : input?.prompt || JSON.stringify(input);
      const request = {
        model,
        prompt,
        n: 1,
        size: providerOptions.size || '1024x1024',
        quality: providerOptions.quality || 'low',
        output_format: providerOptions.outputFormat || 'png'
      };
      const requestBody = JSON.stringify(request);
      const headers = await azureProviderHeaders({
        apiKey, accessTokenProvider, fetchImpl,
        resource: process.env.AZURE_IMAGE_TOKEN_RESOURCE || 'https://ai.azure.com/'
      });
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/openai/v1/images/generations?api-version=preview`, {
        method: 'POST', headers, body: requestBody
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `Azure image HTTP ${response.status}`);
      const base64 = body?.data?.[0]?.b64_json;
      if (!base64) throw new Error('Azure image response contained no image artifact');
      const mediaType = request.output_format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const buffer = Buffer.from(base64, 'base64');
      const stored = await store.put(buffer, { mediaType, prefix: 'image/azure-openai', extension: request.output_format });
      const artifact = artifactFromBase64(base64, {
        mediaType,
        ref: stored.ref,
        provenance: { cloud: 'azure', vendor: 'openai', family: 'gpt-image', model },
        metadata: { size: request.size, quality: request.quality }
      });
      return artifactResult([artifact], {
        provider: 'azure-openai-image',
        cloud: 'azure', vendor: 'openai', modelFamily: 'gpt-image', model,
        modality: 'image', providerLatencyMs: Date.now() - startedAt,
        providerRequestBodyBytes: Buffer.byteLength(requestBody),
        providerResponseBodyBytes: Buffer.byteLength(JSON.stringify(body)),
        artifactBytes: artifact.bytes,
        usage: body.usage || null
      });
    }
  };
}
