import { createOpenAIProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';

export function createProviderAdapter(provider, options = {}) {
  if (provider === 'openai') return createOpenAIProvider(options);
  if (provider === 'anthropic') return createAnthropicProvider(options);
  throw new Error(`Unsupported provider: ${provider}. Supported: openai, anthropic`);
}
