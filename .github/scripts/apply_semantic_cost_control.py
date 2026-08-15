from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


replace_once(
    'adapters/providers/vertex-gemini.js',
    "      const startedAt = Date.now();\n      const prompt = [",
    "      const startedAt = Date.now();\n      const providerOptions = policy?.providerOptions && typeof policy.providerOptions === 'object' ? policy.providerOptions : {};\n      const { providerOptions: _providerOptions, ...taskPolicy } = policy || {};\n      const thinkingBudget = providerOptions.thinkingBudget;\n      if (thinkingBudget != null && (!Number.isInteger(thinkingBudget) || thinkingBudget < -1)) {\n        throw new Error('Vertex Gemini thinkingBudget must be an integer >= -1');\n      }\n      const prompt = ["
)
replace_once(
    'adapters/providers/vertex-gemini.js',
    "        Object.keys(policy || {}).length ? `Request policy: ${JSON.stringify(policy)}` : null",
    "        Object.keys(taskPolicy).length ? `Request policy: ${JSON.stringify(taskPolicy)}` : null"
)
replace_once(
    'adapters/providers/vertex-gemini.js',
    "      const requestBody = JSON.stringify({\n        contents: [{ role: 'user', parts: [{ text: prompt }] }]\n      });",
    "      const requestBody = JSON.stringify({\n        contents: [{ role: 'user', parts: [{ text: prompt }] }],\n        ...(thinkingBudget == null ? {} : { generationConfig: { thinkingConfig: { thinkingBudget } } })\n      });"
)
replace_once(
    'adapters/providers/vertex-gemini.js',
    "          providerBodyBytes: providerRequestBodyBytes + providerResponseBodyBytes,\n          usage: body.usageMetadata || null",
    "          providerBodyBytes: providerRequestBodyBytes + providerResponseBodyBytes,\n          thinkingBudget: thinkingBudget ?? null,\n          usage: body.usageMetadata || null"
)

replace_once(
    'benchmarks/semantic-retrieval-ab.js',
    "    policy: { benchmark: 'semantic-retrieval-gate-direct-control' }\n  });\n  const azure = azureUsage(research.metadata);",
    "    policy: { benchmark: 'semantic-retrieval-gate-direct-control', providerOptions: { thinkingBudget: 0 } }\n  });\n  const azure = azureUsage(research.metadata);"
)
replace_once(
    'benchmarks/semantic-retrieval-ab.js',
    "      policy: { benchmark: 'semantic-retrieval-gate' }\n    }\n  ];",
    "      policy: { benchmark: 'semantic-retrieval-gate', providerOptions: { thinkingBudget: 0 } }\n    }\n  ];"
)
replace_once(
    'benchmarks/semantic-retrieval-ab.js',
    "    models: { azure: azureModel, gemini: geminiModel },\n    pricingSnapshot: rates,",
    "    models: { azure: azureModel, gemini: geminiModel },\n    geminiThinkingBudget: 0,\n    thinkingControl: 'Gemini 2.5 Flash thinking is disabled symmetrically in direct and TRUYN review arms because this benchmark is deterministic extraction/verification; retrieval itself remains model-free.',\n    pricingSnapshot: rates,"
)

Path('tests/vertex-gemini.test.js').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexGeminiProvider } from '../adapters/providers/vertex-gemini.js';

function fakeResponse(body = {}) {
  return {
    ok: true,
    headers: { get: () => 'request-test' },
    async json() {
      return {
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, totalTokenCount: 11 },
        ...body
      };
    }
  };
}

test('Vertex Gemini applies signed thinkingBudget provider option without leaking it into prompt policy text', async () => {
  let captured;
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    location: 'global',
    model: 'gemini-2.5-flash',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return fakeResponse();
    }
  });
  const result = await provider.execute({
    capability: 'review',
    input: { task: 'Return exact value' },
    policy: { benchmark: 'semantic', providerOptions: { thinkingBudget: 0 } }
  });
  assert.equal(captured.generationConfig.thinkingConfig.thinkingBudget, 0);
  const prompt = captured.contents[0].parts[0].text;
  assert.match(prompt, /semantic/);
  assert.doesNotMatch(prompt, /thinkingBudget|providerOptions/);
  assert.equal(result.metadata.thinkingBudget, 0);
});

test('Vertex Gemini leaves thinking configuration on provider default when option is absent', async () => {
  let captured;
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return fakeResponse();
    }
  });
  const result = await provider.execute({ capability: 'review', input: 'x', policy: { benchmark: 'default' } });
  assert.equal(captured.generationConfig, undefined);
  assert.equal(result.metadata.thinkingBudget, null);
});

test('Vertex Gemini rejects invalid thinkingBudget before provider request', async () => {
  const provider = createVertexGeminiProvider({
    projectId: 'project-test',
    accessTokenProvider: async () => 'token-test',
    fetchImpl: async () => { throw new Error('fetch should not run'); }
  });
  await assert.rejects(
    provider.execute({ capability: 'review', input: 'x', policy: { providerOptions: { thinkingBudget: -2 } } }),
    /thinkingBudget must be an integer >= -1/
  );
});
''')