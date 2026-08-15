import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createProviderAdapter } from '../../adapters/providers/index.js';

const providerName = process.env.SMOKE_PROVIDER;
const outputDir = resolve(process.env.SMOKE_OUTPUT_DIR || 'smoke-artifacts/image');
if (!providerName) throw new Error('SMOKE_PROVIDER is required');
await mkdir(outputDir, { recursive: true });

let savedPath = null;
const artifactStore = {
  async put(buffer, { extension = 'bin' } = {}) {
    savedPath = resolve(outputDir, `${providerName}.${extension}`);
    await writeFile(savedPath, buffer);
    return { ref: `file://${savedPath}`, bytes: buffer.byteLength };
  }
};

let options = { capabilities: ['media.image.generate'], artifactStore };
if (providerName === 'vertex-image') {
  options = {
    ...options,
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_IMAGE_REGION || 'global',
    model: process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image',
    endpoint: process.env.VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com',
    accessTokenProvider: async () => process.env.GCP_ACCESS_TOKEN
  };
} else if (providerName === 'azure-openai-image') {
  options = {
    ...options,
    endpoint: process.env.AZURE_IMAGE_ENDPOINT,
    model: process.env.AZURE_IMAGE_DEPLOYMENT,
    apiKey: process.env.AZURE_IMAGE_API_KEY
  };
}

const provider = createProviderAdapter(providerName, options);
const startedAt = Date.now();
const result = await provider.execute({
  capability: 'media.image.generate',
  input: 'A single solid blue circle centered on a plain white background. No text, no watermark.',
  policy: providerName === 'azure-openai-image'
    ? { providerOptions: { size: '1024x1024', quality: 'low', outputFormat: 'png' } }
    : {}
});

const artifact = result.output?.artifacts?.[0];
if (!artifact || artifact.bytes <= 0 || !savedPath) throw new Error('Image smoke returned no saved artifact');
const summary = {
  ok: true,
  modality: 'image',
  provider: providerName,
  model: result.metadata?.model || null,
  latencyMs: Date.now() - startedAt,
  providerLatencyMs: result.metadata?.providerLatencyMs || null,
  artifactBytes: artifact.bytes,
  mediaType: artifact.mediaType,
  sha256: artifact.sha256,
  artifactFile: savedPath,
  usage: result.metadata?.usage || null
};
console.log(JSON.stringify(summary));
