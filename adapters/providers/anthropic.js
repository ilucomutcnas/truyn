function extractText(message) {
  return (message.content || [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

export function createAnthropicProvider({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL,
  baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  capabilities = ['review']
} = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');
  if (!model) throw new Error('ANTHROPIC_MODEL is required');

  return {
    name: 'anthropic-messages',
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

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 2048),
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `Anthropic HTTP ${response.status}`);

      return {
        output: extractText(body),
        metadata: {
          provider: 'anthropic',
          model: body.model || model,
          providerRequestId: body.id || null,
          providerLatencyMs: Date.now() - startedAt,
          usage: body.usage || null
        }
      };
    }
  };
}
