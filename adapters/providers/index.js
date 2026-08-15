import { createOpenAIProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';
import { createAzureOpenAIProvider } from './azure-openai.js';
import { createVertexGeminiProvider } from './vertex-gemini.js';

export function createProviderAdapter(provider, options = {}) {
  if (provider === 'openai') return createOpenAIProvider(options);
  if (provider === 'anthropic') return createAnthropicProvider(options);
  if (provider === 'azure' || provider === 'azure-openai') return createAzureOpenAIProvider(options);
  if (provider === 'gemini' || provider === 'vertex' || provider === 'vertex-gemini') return createVertexGeminiProvider(options);
  throw new Error(`Unsupported provider: ${provider}. Supported: openai, anthropic, azure-openai, vertex-gemini`);
}
