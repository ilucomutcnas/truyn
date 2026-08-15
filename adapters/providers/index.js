import { createOpenAIProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';
import { createAzureOpenAIProvider } from './azure-openai.js';
import { createAzureFoundryProvider } from './azure-foundry.js';
import { createAzureOpenAIImageProvider } from './azure-openai-image.js';
import { createAzureOpenAIVideoProvider } from './azure-openai-video.js';
import { createVertexGeminiProvider } from './vertex-gemini.js';
import { createVertexImageProvider } from './vertex-image.js';
import { createVertexVeoProvider } from './vertex-veo.js';

export function createProviderAdapter(provider, options = {}) {
  if (provider === 'openai') return createOpenAIProvider(options);
  if (provider === 'anthropic') return createAnthropicProvider(options);
  if (provider === 'azure' || provider === 'azure-openai') return createAzureOpenAIProvider(options);
  if (provider === 'azure-foundry') return createAzureFoundryProvider(options);
  if (provider === 'azure-openai-image' || provider === 'azure-image') return createAzureOpenAIImageProvider(options);
  if (provider === 'azure-openai-video' || provider === 'azure-video' || provider === 'sora') return createAzureOpenAIVideoProvider(options);
  if (provider === 'gemini' || provider === 'vertex' || provider === 'vertex-gemini') return createVertexGeminiProvider(options);
  if (provider === 'vertex-image' || provider === 'google-image') return createVertexImageProvider(options);
  if (provider === 'vertex-veo' || provider === 'veo') return createVertexVeoProvider(options);
  throw new Error(`Unsupported provider: ${provider}. Supported: openai, anthropic, azure-openai, azure-foundry, azure-openai-image, azure-openai-video, vertex-gemini, vertex-image, vertex-veo`);
}
