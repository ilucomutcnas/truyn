export const MCP_PROVIDER_PROTOCOL_VERSION = '2026-07-28';

function normalizeEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error('MCP_HTTP_ENDPOINT must be an absolute URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('MCP_HTTP_ENDPOINT must use http or https');
  }
  return parsed.toString();
}

function outputFromResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (Object.prototype.hasOwnProperty.call(result, 'structuredContent')) return result.structuredContent;
  if (Array.isArray(result.content)) {
    const text = result.content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text);
    if (text.length === result.content.length) return text.join('\n');
    return result.content;
  }
  return result;
}

function errorText(result) {
  if (!Array.isArray(result?.content)) return 'MCP tool returned an error';
  const text = result.content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
  return text || 'MCP tool returned an error';
}

export function createMcpHttpToolProvider({
  endpoint = process.env.MCP_HTTP_ENDPOINT,
  tool = process.env.MCP_HTTP_TOOL,
  apiKey = process.env.MCP_HTTP_API_KEY,
  authMode = apiKey ? 'bearer' : 'none',
  capabilities = ['reasoning.general'],
  fetchImpl = fetch
} = {}) {
  if (!endpoint) throw new Error('MCP_HTTP_ENDPOINT is required');
  if (!tool || typeof tool !== 'string') throw new Error('MCP_HTTP_TOOL is required');
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!['none', 'bearer'].includes(authMode)) throw new Error(`Unsupported MCP HTTP auth mode: ${authMode}`);
  if (authMode === 'bearer' && !apiKey) throw new Error('MCP_HTTP_API_KEY is required for bearer auth');

  return {
    name: 'mcp-http-tool',
    version: '1',
    capabilities,
    async execute({ capability, input, policy }) {
      const startedAt = Date.now();
      const id = `truyn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const headers = {
        'content-type': 'application/json',
        accept: 'application/json',
        'mcp-protocol-version': MCP_PROVIDER_PROTOCOL_VERSION,
        'mcp-method': 'tools/call',
        'mcp-name': tool
      };
      if (authMode === 'bearer') headers.authorization = `Bearer ${apiKey}`;

      const response = await fetchImpl(normalizedEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: {
            name: tool,
            arguments: { capability, input, policy: policy || {} },
            _meta: {
              'io.modelcontextprotocol/clientInfo': {
                name: 'truyn-byok-provider',
                version: '0.1.0'
              }
            }
          }
        })
      });

      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        throw new Error(`MCP HTTP provider requires application/json response, received ${contentType || 'unknown content type'}`);
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `MCP HTTP ${response.status}`);
      if (body?.error) throw new Error(body.error.message || 'MCP JSON-RPC error');
      if (body?.result?.isError) throw new Error(errorText(body.result).slice(0, 500));

      return {
        output: outputFromResult(body?.result),
        metadata: {
          provider: 'mcp-http',
          tool,
          providerRequestId: body?.id ?? null,
          providerLatencyMs: Date.now() - startedAt,
          usage: body?.result?._meta?.usage || null
        }
      };
    }
  };
}
