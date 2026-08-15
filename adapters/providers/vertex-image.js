import { googleProviderHeaders, googleMetadataAccessToken } from './common/google-auth.js';
import { artifactFromBase64, artifactResult } from './common/artifacts.js';
import { createGcsArtifactStore } from './common/gcs-artifact-store.js';

function firstInlineImage(body) {
  for (const candidate of body?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data && inline?.mimeType) return inline;
    }
  }
  return null;
}

export function createVertexImageProvider({
  projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  location = process.env.GCP_IMAGE_REGION || process.env.GCP_REGION || 'global',
  model = process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image',
  endpoint = process.env.VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com',
  capabilities = ['media.image.generate'],
  accessTokenProvider = googleMetadataAccessToken,
  artifactStore,
  fetchImpl = fetch
} = {}) {
  if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');
  const store = artifactStore || createGcsArtifactStore({ accessTokenProvider, fetchImpl });

  return {
    name: 'vertex-image-generate-content',
    version: '1',
    capabilities,
    async execute({ input, policy = {} }) {
      const startedAt = Date.now();
      const prompt = typeof input === 'string' ? input : input?.prompt || JSON.stringify(input);
      const requestBody = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], candidateCount: 1 }
      });
      const headers = await googleProviderHeaders({ accessTokenProvider, fetchImpl });
      const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/v1/${modelPath}:generateContent`, {
        method: 'POST', headers, body: requestBody
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `Vertex image HTTP ${response.status}`);
      const inline = firstInlineImage(body);
      if (!inline) throw new Error('Vertex image response contained no image artifact');
      const buffer = Buffer.from(inline.data, 'base64');
      const mediaType = inline.mimeType;
      const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png';
      const stored = await store.put(buffer, { mediaType, prefix: 'image/vertex', extension });
      const artifact = artifactFromBase64(inline.data, {
        mediaType,
        ref: stored.ref,
        provenance: { cloud: 'gcp', vendor: 'google', family: 'google-image', model }
      });
      return artifactResult([artifact], {
        provider: 'vertex-image',
        cloud: 'gcp',
        vendor: 'google',
        modelFamily: 'google-image',
        model,
        modality: 'image',
        providerLatencyMs: Date.now() - startedAt,
        providerRequestBodyBytes: Buffer.byteLength(requestBody),
        providerResponseBodyBytes: Buffer.byteLength(JSON.stringify(body)),
        artifactBytes: artifact.bytes,
        usage: body.usageMetadata || null
      });
    }
  };
}
