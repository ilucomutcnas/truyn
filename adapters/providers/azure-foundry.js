import { azureProviderHeaders, containerAppsManagedIdentityToken } from './common/azure-auth.js';

function extractChatText(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || '').filter(Boolean).join('\n');
  return '';
}

export function createAzureFoundryProvider({
  endpoint = process.env.AZURE_FOUNDRY_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
  deployment = process.env.AZURE_FOUNDRY_DEPLOYMENT,
  vendor = process.env.TRUYN_MODEL_VENDOR || 'unknown',
  family = process.env.TRUYN_MODEL_FAMILY || deployment || 'unknown',
  apiKey = process.env.AZURE_FOUNDRY_API_KEY,
  capabilities = ['reasoning.general'],
  accessTokenProvider = containerAppsManagedIdentityToken,
  fetchImpl = fetch
} = {}) {
  if (!endpoint) throw new Error('AZURE_FOUNDRY_ENDPOINT or AZURE_OPENAI_ENDPOINT is required');
  if (!deployment) throw new Error('AZURE_FOUNDRY_DEPLOYMENT is required');

  return {
    name: `azure-foundry-${family}`,
    version: '1',
    capabilities,
    async execute({ capability, input, policy = {} }) {
      const startedAt = Date.now();
      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};
      const prompt = typeof input === 'string' ? input : JSON.stringify(input);
      const request = {
        model: deployment,
        messages: [
          { role: 'system', content: `You are a TRUYN provider for capability: ${capability}. Return only the useful task result.` },
          { role: 'user', content: prompt }
        ],
        temperature: providerOptions.temperature ?? 0,
        max_tokens: providerOptions.maxTokens ?? 128
      };
      const requestBody = JSON.stringify(request);
      const headers = await azureProviderHeaders({
        apiKey,
        accessTokenProvider,
        fetchImpl,
        resource: process.env.AZURE_FOUNDRY_TOKEN_RESOURCE || 'https://cognitiveservices.azure.com/'
      });
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/openai/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: requestBody
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || body?.message || `Azure Foundry HTTP ${response.status}`);

      const providerRequestBodyBytes = Buffer.byteLength(requestBody);
      const providerResponseBodyBytes = Buffer.byteLength(JSON.stringify(body));
      return {
        output: extractChatText(body),
        metadata: {
          provider: 'azure-foundry',
          cloud: 'azure',
          vendor,
          modelFamily: family,
          model: body.model || deployment,
          providerRequestId: body.id || response.headers?.get?.('x-request-id') || null,
          providerLatencyMs: Date.now() - startedAt,
          providerRequestBodyBytes,
          providerResponseBodyBytes,
          providerBodyBytes: providerRequestBodyBytes + providerResponseBodyBytes,
          usage: body.usage || null
        }
      };
    }
  };
}
