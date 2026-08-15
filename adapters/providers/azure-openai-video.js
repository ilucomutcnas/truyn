import { azureProviderHeaders, containerAppsManagedIdentityToken } from './common/azure-auth.js';
import { artifactFromBuffer, artifactResult } from './common/artifacts.js';
import { createAzureBlobArtifactStore } from './common/azure-blob-artifact-store.js';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function createAzureOpenAIVideoProvider({
  endpoint = process.env.AZURE_VIDEO_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
  model = process.env.AZURE_VIDEO_DEPLOYMENT || process.env.AZURE_VIDEO_MODEL,
  apiKey = process.env.AZURE_VIDEO_API_KEY || process.env.AZURE_OPENAI_API_KEY,
  capabilities = ['media.video.generate'],
  accessTokenProvider = containerAppsManagedIdentityToken,
  artifactStore,
  fetchImpl = fetch,
  pollIntervalMs = Number(process.env.AZURE_VIDEO_POLL_MS || 5000),
  timeoutMs = Number(process.env.AZURE_VIDEO_TIMEOUT_MS || 300000)
} = {}) {
  if (!endpoint) throw new Error('AZURE_VIDEO_ENDPOINT or AZURE_OPENAI_ENDPOINT is required');
  if (!model) throw new Error('AZURE_VIDEO_DEPLOYMENT or AZURE_VIDEO_MODEL is required');
  const store = artifactStore || createAzureBlobArtifactStore({ accessTokenProvider, fetchImpl });

  return {
    name: 'azure-openai-sora-video',
    version: '1',
    capabilities,
    async execute({ input, policy = {} }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const prompt = typeof input === 'string' ? input : input?.prompt || JSON.stringify(input);
      const width = providerOptions.width ?? 480;
      const height = providerOptions.height ?? 480;
      const nSeconds = providerOptions.nSeconds ?? 1;
      const request = { prompt, width, height, n_seconds: nSeconds, model };
      const requestBody = JSON.stringify(request);
      const headers = await azureProviderHeaders({
        apiKey, accessTokenProvider, fetchImpl,
        resource: process.env.AZURE_VIDEO_TOKEN_RESOURCE || 'https://ai.azure.com/'
      });
      const root = `${endpoint.replace(/\/$/, '')}/openai/v1/video/generations`;
      const createResponse = await fetchImpl(`${root}/jobs?api-version=preview`, { method: 'POST', headers, body: requestBody });
      const createBody = await createResponse.json();
      if (!createResponse.ok || !createBody.id) throw new Error(createBody?.error?.message || `Azure Sora HTTP ${createResponse.status}`);

      let pollCount = 0;
      let job = createBody;
      while (!['succeeded', 'failed', 'cancelled'].includes(job.status) && Date.now() - startedAt < timeoutMs) {
        await sleep(pollIntervalMs);
        pollCount += 1;
        const pollResponse = await fetchImpl(`${root}/jobs/${encodeURIComponent(createBody.id)}?api-version=preview`, { headers });
        job = await pollResponse.json();
        if (!pollResponse.ok) throw new Error(job?.error?.message || `Azure Sora poll HTTP ${pollResponse.status}`);
      }
      if (job.status !== 'succeeded') throw new Error(job?.error?.message || `Azure Sora job ended with status ${job.status || 'timeout'}`);
      const generationId = job?.generations?.[0]?.id;
      if (!generationId) throw new Error('Azure Sora response contained no generation id');
      const contentResponse = await fetchImpl(`${root}/${encodeURIComponent(generationId)}/content/video?api-version=preview`, { headers });
      if (!contentResponse.ok) throw new Error(`Azure Sora video download HTTP ${contentResponse.status}`);
      const buffer = Buffer.from(await contentResponse.arrayBuffer());
      const stored = await store.put(buffer, { mediaType: 'video/mp4', prefix: 'video/azure-sora', extension: 'mp4' });
      const artifact = artifactFromBuffer(buffer, {
        mediaType: 'video/mp4', ref: stored.ref,
        provenance: { cloud: 'azure', vendor: 'openai', family: 'sora', model },
        metadata: { width, height, nSeconds }
      });
      return artifactResult([artifact], {
        provider: 'azure-openai-video', cloud: 'azure', vendor: 'openai', modelFamily: 'sora', model,
        modality: 'video', providerRequestId: createBody.id,
        providerLatencyMs: Date.now() - startedAt,
        providerRequestBodyBytes: Buffer.byteLength(requestBody),
        providerResponseBodyBytes: Buffer.byteLength(JSON.stringify(job)),
        artifactBytes: artifact.bytes, jobPollCount: pollCount,
        video: { width, height, nSeconds }
      });
    }
  };
}
