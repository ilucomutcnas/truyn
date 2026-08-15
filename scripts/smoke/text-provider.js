import { createProviderAdapter } from '../../adapters/providers/index.js';

const providerName = process.env.SMOKE_PROVIDER;
if (!providerName) throw new Error('SMOKE_PROVIDER is required');

const capabilities = ['reasoning.general'];
let options = { capabilities };

if (providerName === 'vertex-gemini') {
  const accessToken = process.env.GCP_ACCESS_TOKEN;
  options = {
    ...options,
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_REGION || 'global',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    endpoint: process.env.VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com',
    accessTokenProvider: async () => accessToken
  };
} else if (providerName === 'azure-openai') {
  options = {
    ...options,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    model: process.env.AZURE_OPENAI_DEPLOYMENT || process.env.AZURE_OPENAI_MODEL,
    apiKey: process.env.AZURE_OPENAI_API_KEY
  };
} else if (providerName === 'azure-foundry') {
  options = {
    ...options,
    endpoint: process.env.AZURE_FOUNDRY_ENDPOINT,
    deployment: process.env.AZURE_FOUNDRY_DEPLOYMENT,
    vendor: process.env.TRUYN_MODEL_VENDOR,
    family: process.env.TRUYN_MODEL_FAMILY,
    apiKey: process.env.AZURE_FOUNDRY_API_KEY
  };
}

const provider = createProviderAdapter(providerName, options);
const startedAt = Date.now();
const family = process.env.TRUYN_MODEL_FAMILY || '';
const maxTokens = family === 'kimi' ? 512 : 64;
const result = await provider.execute({
  capability: 'reasoning.general',
  input: 'Return exactly: TRUYN_TEXT_SMOKE_OK',
  policy: providerName === 'vertex-gemini'
    ? { providerOptions: { thinkingBudget: 0 } }
    : { providerOptions: { temperature: 0, maxTokens } }
});
const text = typeof result.output === 'string' ? result.output.trim() : JSON.stringify(result.output);
if (!text.includes('TRUYN_TEXT_SMOKE_OK')) throw new Error(`Unexpected provider output: ${text.slice(0, 200)}`);

const summary = {
  ok: true,
  modality: 'text',
  provider: providerName,
  vendor: result.metadata?.vendor || null,
  family: result.metadata?.modelFamily || null,
  model: result.metadata?.model || null,
  latencyMs: Date.now() - startedAt,
  providerLatencyMs: result.metadata?.providerLatencyMs || null,
  usage: result.metadata?.usage || null
};
console.log(JSON.stringify(summary));
