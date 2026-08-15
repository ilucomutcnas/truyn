function extractText(response) {
  if (typeof response.output_text === 'string' && response.output_text.length) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

export function createOpenAIProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL,
  baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com',
  capabilities = ['research'],
  allowNoAuth = false,
  fetchImpl = fetch
} = {}) {
  if (!apiKey && !allowNoAuth) throw new Error('OPENAI_API_KEY is required');
  if (!model) throw new Error('OPENAI_MODEL is required');

  return {
    name: 'openai-responses',
    version: '1',
    capabilities,
    async execute({ capability, input, policy }) {
      const startedAt = Date.now();
      const prompt = [
        `You are a TRUYN provider for capability: ${capability}.`,
        'Return only the useful task result. Do not describe TRUYN internals unless asked.',
        `Task input: ${typeof input === 'string' ? input : JSON.stringify(input)}`,
        Object.keys(policy || {}).length ? `Request policy: ${JSON.stringify(policy)}` : null
      ].filter(Boolean).join('\n\n');

      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: prompt, store: false })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`);

      return {
        output: extractText(body),
        metadata: {
          provider: 'openai',
          model: body.model || model,
          providerRequestId: body.id || null,
          providerLatencyMs: Date.now() - startedAt,
          usage: body.usage || null
        }
      };
    }
  };
}