import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createProviderAdapter } from '../../adapters/providers/index.js';

const providerName = process.env.SMOKE_PROVIDER;
const outputDir = resolve(process.env.SMOKE_OUTPUT_DIR || 'smoke-artifacts/video');
if (!providerName) throw new Error('SMOKE_PROVIDER is required');
await mkdir(outputDir, { recursive: true });

let savedPath = null;
const artifactStore = {
  async put(buffer, { extension = 'mp4' } = {}) {
    savedPath = resolve(outputDir, `${providerName}.${extension}`);
    await writeFile(savedPath, buffer);
    return { ref: `file://${savedPath}`, bytes: buffer.byteLength };
  }
};

let options = { capabilities: ['media.video.generate'], artifactStore };
if (providerName === 'vertex-veo') {
  options = {
    ...options,
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_VIDEO_REGION || 'us-central1',
    model: process.env.VEO_MODEL || 'veo-3.1-fast-generate-001',
    endpoint: process.env.VERTEX_API_ENDPOINT,
    accessTokenProvider: async () => process.env.GCP_ACCESS_TOKEN,
    pollIntervalMs: Number(process.env.VEO_POLL_MS || 5000),
    timeoutMs: Number(process.env.VEO_TIMEOUT_MS || 300000)
  };
} else if (providerName === 'azure-openai-video') {
  options = {
    ...options,
    endpoint: process.env.AZURE_VIDEO_ENDPOINT,
    model: process.env.AZURE_VIDEO_DEPLOYMENT,
    apiKey: process.env.AZURE_VIDEO_API_KEY,
    pollIntervalMs: Number(process.env.AZURE_VIDEO_POLL_MS || 5000),
    timeoutMs: Number(process.env.AZURE_VIDEO_TIMEOUT_MS || 300000)
  };
}

const provider = createProviderAdapter(providerName, options);
const startedAt = Date.now();
const policy = providerName === 'vertex-veo'
  ? { providerOptions: { durationSeconds: 4, resolution: '720p', sampleCount: 1, personGeneration: 'disallow', inlineOutput: true } }
  : { providerOptions: { width: 480, height: 480, nSeconds: 1 } };

const result = await provider.execute({
  capability: 'media.video.generate',
  input: 'A simple solid blue sphere slowly rotating on a plain white background. Static camera. No people. No text.',
  policy
});
const artifact = result.output?.artifacts?.[0];
if (!artifact || artifact.bytes <= 0 || !savedPath) throw new Error('Video smoke returned no saved artifact');
const summary = {
  ok: true,
  modality: 'video',
  provider: providerName,
  model: result.metadata?.model || null,
  latencyMs: Date.now() - startedAt,
  providerLatencyMs: result.metadata?.providerLatencyMs || null,
  jobPollCount: result.metadata?.jobPollCount || null,
  artifactBytes: artifact.bytes,
  mediaType: artifact.mediaType,
  sha256: artifact.sha256,
  artifactFile: savedPath,
  video: result.metadata?.video || null
};
console.log(JSON.stringify(summary));
