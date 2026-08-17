import http from 'node:http';
import { createIdentity } from '../../core/identity/index.js';
import { createAttestation } from '../../core/claims/index.js';
import { createTrustRevocation, createVerification } from '../../core/trust/lifecycle.js';

const identity = createIdentity();
const issued = new Map();

function send(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, nodeId: identity.nodeId });
    }
    if (req.method === 'POST' && req.url === '/verify') {
      const body = await readJson(req);
      const sourceId = String(body.sourceId || '').trim();
      if (!sourceId) throw new Error('sourceId_required');
      const attestation = createAttestation({
        identity,
        claim: body.claim,
        verdict: body.verdict,
        evidence: [{ kind: 'real-process-http', sourceId }],
        lineage: {
          originIds: [String(body.originId || `origin:${sourceId}`)],
          publisherIds: [String(body.publisherId || `publisher:${sourceId}`)]
        },
        method: 'verify-v02-real-process-http',
        createdAt: body.createdAt || new Date().toISOString()
      });
      const verification = createVerification({ identity, challenge: body.challenge, attestation });
      issued.set(attestation.attestationId, attestation);
      return send(res, 200, { nodeId: identity.nodeId, attestation, verification });
    }
    if (req.method === 'POST' && req.url === '/revoke') {
      const body = await readJson(req);
      const attestation = issued.get(body.attestationId);
      if (!attestation) return send(res, 404, { ok: false, error: 'unknown_attestation' });
      const revocation = createTrustRevocation({
        identity,
        targetType: 'attestation',
        targetId: attestation.attestationId,
        reasonDigest: 'sha256:verify-v02-real-process-revocation'
      });
      return send(res, 200, { nodeId: identity.nodeId, revocation });
    }
    return send(res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message });
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  process.stdout.write(`${JSON.stringify({ ready: true, port, nodeId: identity.nodeId })}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 250).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
