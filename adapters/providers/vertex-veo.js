import { googleProviderHeaders, googleMetadataAccessToken } from './common/google-auth.js';
import { artifactFromBuffer, artifactResult } from './common/artifacts.js';
import { createGcsArtifactStore } from './common/gcs-artifact-store.js';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function createVertexVeoProvider({
  projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  location = process.env.GCP_VIDEO_REGION || 'us-central1',
  model = process.env.VEO_MODEL || 'veo-3.1-fast-generate-001',
  endpoint,
  capabilities = ['media.video.generate'],
  accessTokenProvider = googleMetadataAccessToken,
  artifactStore,
  fetchImpl = fetch,
  pollIntervalMs = Number(process.env.VEO_POLL_MS || 5000),
  timeoutMs = Number(process.env.VEO_TIMEOUT_MS || 240000)
} = {}) {
  if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');
  const apiEndpoint = endpoint || `https://${location}-aiplatform.googleapis.com`;
  const store = artifactStore || createGcsArtifactStore({ accessTokenProvider, fetchImpl });

  return {
    name: 'vertex-veo-predict-long-running',
    version: '1',
    capabilities,
    async execute({ input, policy = {} }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const prompt = typeof input === 'string' ? input : input?.prompt || JSON.stringify(input);
      const durationSeconds = providerOptions.durationSeconds ?? 4;
      const resolution = providerOptions.resolution || '720p';
      const sampleCount = providerOptions.sampleCount ?? 1;
      const outputPrefix = `gs://${store.bucket}/video/veo/${Date.now()}-/`;
      const request = {
        instances: [{ prompt }],
        parameters: {
          storageUri: outputPrefix,
          sampleCount,
          durationSeconds,
          resolution,
          personGeneration: providerOptions.personGeneration || 'disallow'
        }
      };
      const requestBody = JSON.stringify(request);
      const headers = await googleProviderHeaders({ accessTokenProvider, fetchImpl });
      const modelBase = `${apiEndpoint.replace(/\/$/, '')}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
      const createResponse = await fetchImpl(`${modelBase}:predictLongRunning`, { method: 'POST', headers, body: requestBody });
      const createBody = await createResponse.json();
      if (!createResponse.ok || !createBody.name) throw new Error(createBody?.error?.message || `Vertex Veo HTTP ${createResponse.status}`);

      let pollCount = 0;
      let operation = null;
      while (Date.now() - startedAt < timeoutMs) {
        pollCount += 1;
        const pollResponse = await fetchImpl(`${modelBase}:fetchPredictOperation`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ operationName: createBody.name })
        });
        operation = await pollResponse.json();
        if (!pollResponse.ok) throw new Error(operation?.error?.message || `Vertex Veo poll HTTP ${pollResponse.status}`);
        if (operation.done) break;
        await sleep(pollIntervalMs);
      }
      if (!operation?.done) throw new Error(`Vertex Veo timed out after ${timeoutMs}ms`);
      if (operation.error) throw new Error(operation.error.message || 'Vertex Veo operation failed');
      const videos = operation?.response?.videos || [];
      if (!videos.length || !videos[0]?.gcsUri) throw new Error('Vertex Veo response contained no video artifact');
      const ref = videos[0].gcsUri;
      const buffer = await store.get(ref);
      const artifact = artifactFromBuffer(buffer, {
        mediaType: videos[0].mimeType || 'video/mp4',
        ref,
        provenance: { cloud: 'gcp', vendor: 'google', family: 'veo', model },
        metadata: { durationSeconds, resolution, sampleCount }
      });
      return artifactResult([artifact], {
        provider: 'vertex-veo',
        cloud: 'gcp',
        vendor: 'google',
        modelFamily: 'veo',
        model,
        modality: 'video',
        providerRequestId: createBody.name,
        providerLatencyMs: Date.now() - startedAt,
        providerRequestBodyBytes: Buffer.byteLength(requestBody),
        providerResponseBodyBytes: Buffer.byteLength(JSON.stringify(operation)),
        artifactBytes: artifact.bytes,
        jobPollCount: pollCount,
        video: { durationSeconds, resolution, sampleCount }
      });
    }
  };
}
