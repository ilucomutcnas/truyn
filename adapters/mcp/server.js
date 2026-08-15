import http from 'node:http';
import readline from 'node:readline';

export const MCP_MODERN_VERSION = '2026-07-28';
export const MCP_LEGACY_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18']);
export const MCP_SUPPORTED_VERSIONS = Object.freeze([MCP_MODERN_VERSION, ...MCP_LEGACY_VERSIONS]);

const TOOLS = Object.freeze([
  { name: 'truyn_identity', title: 'TRUYN Identity', description: 'Return the cryptographic TRUYN Node identity connected to this MCP server.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'truyn_find', title: 'Find TRUYN Capability', description: 'Find TRUYN nodes currently offering a capability.', inputSchema: { type: 'object', properties: { capability: { type: 'string' } }, required: ['capability'], additionalProperties: false } },
  { name: 'truyn_offer', title: 'Offer TRUYN Capability', description: 'Advertise a capability from this TRUYN Node.', inputSchema: { type: 'object', properties: { capability: { type: 'string' }, metadata: { type: 'object' } }, required: ['capability'], additionalProperties: false } },
  { name: 'truyn_need', title: 'Request TRUYN Capability', description: 'Send a signed NEED to a matching TRUYN provider.', inputSchema: { type: 'object', properties: { capability: { type: 'string' }, input: {}, policy: { type: 'object' } }, required: ['capability', 'input'], additionalProperties: false } },
  { name: 'truyn_poll', title: 'Poll TRUYN Events', description: 'Receive pending signed NEED or RESULT events for this node.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'truyn_result', title: 'Return TRUYN Result', description: 'Return a signed RESULT for a NEED handled by this node.', inputSchema: { type: 'object', properties: { requestId: { type: 'string' }, output: {}, metadata: { type: 'object' } }, required: ['requestId', 'output'], additionalProperties: false } }
]);

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message, data = undefined) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }; }
function toolResult(value) { return { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }; }

export function createMcpHandler({ node, serverName = 'truyn-mvp', serverVersion = '0.1.0-mvp.2' }) {
  if (!node) throw new Error('node is required');
  let registered = false;
  async function ensureRegistered() {
    if (!registered || !node.sessionToken) {
      await node.register({ name: serverName });
      registered = true;
    }
  }
  async function callTool(name, args = {}) {
    if (name === 'truyn_identity') return { nodeId: node.identity.nodeId, algorithm: node.identity.algorithm, protocol: 'TRUYN/1' };
    if (name === 'truyn_find') { if (!args.capability) throw new Error('capability is required'); return node.find(args.capability); }
    if (name === 'truyn_offer') { if (!args.capability) throw new Error('capability is required'); await ensureRegistered(); return node.offer(args.capability, args.metadata || {}); }
    if (name === 'truyn_need') { if (!args.capability || !Object.prototype.hasOwnProperty.call(args, 'input')) throw new Error('capability and input are required'); await ensureRegistered(); return node.need(args.capability, args.input, args.policy || {}); }
    if (name === 'truyn_poll') { await ensureRegistered(); return node.poll(); }
    if (name === 'truyn_result') { if (!args.requestId || !Object.prototype.hasOwnProperty.call(args, 'output')) throw new Error('requestId and output are required'); await ensureRegistered(); return node.result(args.requestId, args.output, args.metadata || {}); }
    const error = new Error(`Unknown tool: ${name}`); error.code = -32602; throw error;
  }
  return async function handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message?.id, -32600, 'Invalid Request');
    const { id, method, params = {} } = message;
    try {
      if (method === 'server/discover') return rpcResult(id, { resultType: 'complete', supportedVersions: [...MCP_SUPPORTED_VERSIONS], capabilities: { tools: { listChanged: false } }, serverInfo: { name: serverName, version: serverVersion }, instructions: 'Use TRUYN tools to expose, discover, request, receive, and return signed agent capabilities.' });
      if (method === 'initialize') {
        const requested = params.protocolVersion;
        const protocolVersion = MCP_LEGACY_VERSIONS.includes(requested) ? requested : MCP_LEGACY_VERSIONS[0];
        return rpcResult(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: serverName, version: serverVersion }, instructions: 'TRUYN connects agent capabilities through signed OFFER, NEED, and RESULT messages.' });
      }
      if (method === 'notifications/initialized') return null;
      if (method === 'tools/list') return rpcResult(id, { tools: [...TOOLS], ttlMs: 1000, cacheScope: 'private' });
      if (method === 'tools/call') {
        if (!params.name) return rpcError(id, -32602, 'Tool name is required');
        const value = await callTool(params.name, params.arguments || {});
        return rpcResult(id, toolResult(value));
      }
      return rpcError(id, -32601, 'Method not found');
    } catch (error) {
      if (method === 'tools/call' && error.code !== -32602) return rpcResult(id, { resultType: 'complete', isError: true, content: [{ type: 'text', text: error.message }] });
      return rpcError(id, error.code || -32603, error.message);
    }
  };
}

export async function runStdioMcpServer({ node, input = process.stdin, output = process.stdout, errorOutput = process.stderr }) {
  const handle = createMcpHandler({ node });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      const response = await handle(message);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      errorOutput.write(`TRUYN MCP error: ${error.message}\n`);
    }
  }
}

async function readJson(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; }
function sendJson(res, status, body) { const data = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) }); res.end(data); }

export function createMcpHttpServer({ node, allowedOrigins = ['http://127.0.0.1', 'http://localhost'] }) {
  const handle = createMcpHandler({ node });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url !== '/mcp') return sendJson(res, 404, rpcError(null, -32601, 'Not found'));
      if (req.method === 'GET') { res.writeHead(405, { allow: 'POST' }); return res.end(); }
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); return res.end(); }
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) return sendJson(res, 403, rpcError(null, -32000, 'Origin not allowed'));
      const message = await readJson(req);
      const version = req.headers['mcp-protocol-version'];
      if (version === MCP_MODERN_VERSION) {
        if (req.headers['mcp-method'] !== message.method) return sendJson(res, 400, rpcError(message.id, -32020, 'Mcp-Method header mismatch'));
        if (message.method === 'tools/call' && req.headers['mcp-name'] !== message.params?.name) return sendJson(res, 400, rpcError(message.id, -32020, 'Mcp-Name header mismatch'));
      } else if (version && !MCP_SUPPORTED_VERSIONS.includes(version)) {
        return sendJson(res, 400, rpcError(message.id, -32022, 'Unsupported protocol version', { supported: MCP_SUPPORTED_VERSIONS }));
      }
      const response = await handle(message);
      if (!response) { res.writeHead(202); return res.end(); }
      return sendJson(res, 200, response);
    } catch (error) {
      return sendJson(res, 500, rpcError(null, -32603, error.message));
    }
  });
  return {
    server,
    async listen({ host = '127.0.0.1', port = 8791 } = {}) { await new Promise((resolve) => server.listen(port, host, resolve)); const address = server.address(); return `http://${host}:${address.port}/mcp`; },
    async close() { if (!server.listening) return; await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  };
}
