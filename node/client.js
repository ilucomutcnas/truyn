import { compactFrameBytes, createCompactFrame, createEnvelope, verifyCompactFrame, verifyEnvelope } from '../core/protocol/index.js';
import { createIdentity } from '../core/identity/index.js';

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

export class TruynNode {
  constructor({ relayUrl, identity = createIdentity() }) {
    if (!relayUrl) throw new Error('relayUrl is required');
    this.relayUrl = relayUrl.replace(/\/$/, '');
    this.identity = identity;
    this.sessionToken = null;
    this.identityCache = new Map([[identity.nodeId, identity.publicKeyPem]]);
  }

  envelope(type, payload, extra = {}) {
    return createEnvelope({
      type,
      from: this.identity.nodeId,
      privateKeyPem: this.identity.privateKeyPem,
      publicKeyPem: this.identity.publicKeyPem,
      payload,
      ...extra
    });
  }

  compactFrame(type, payload, extra = {}) {
    return createCompactFrame({
      type,
      payload,
      privateKeyPem: this.identity.privateKeyPem,
      ...extra
    });
  }

  rememberIdentity(nodeId, publicKeyPem) {
    if (nodeId && publicKeyPem) this.identityCache.set(nodeId, publicKeyPem);
  }

  async resolveIdentity(nodeId) {
    if (this.identityCache.has(nodeId)) return this.identityCache.get(nodeId);
    const result = await requestJson(`${this.relayUrl}/v1/nodes/${encodeURIComponent(nodeId)}`);
    this.rememberIdentity(result.nodeId, result.publicKey);
    return result.publicKey;
  }

  async register({ name = null, protocols = ['TRUYN/1'] } = {}) {
    const envelope = this.envelope('IDENTITY', {
      nodeId: this.identity.nodeId,
      algorithm: this.identity.algorithm,
      protocols,
      name
    });
    const result = await requestJson(`${this.relayUrl}/v1/register`, {
      method: 'POST',
      body: JSON.stringify({ envelope })
    });
    this.sessionToken = result.sessionToken;
    return result;
  }

  async offer(capability, metadata = {}) {
    const envelope = this.envelope('OFFER', {
      capability: { name: capability },
      metadata
    });
    return requestJson(`${this.relayUrl}/v1/offers`, {
      method: 'POST',
      body: JSON.stringify({ envelope })
    });
  }

  async find(capability) {
    const result = await requestJson(`${this.relayUrl}/v1/offers?capability=${encodeURIComponent(capability)}`);
    for (const offer of result.offers || []) this.rememberIdentity(offer.from, offer.publicKey);
    return result;
  }

  async need(capability, input, policy = {}) {
    const envelope = this.envelope('NEED', {
      capability: { name: capability },
      input,
      policy
    });
    return requestJson(`${this.relayUrl}/v1/needs`, {
      method: 'POST',
      body: JSON.stringify({ envelope })
    });
  }

  async compactNeed(capability, input, policy = {}, { waitMs = 120_000 } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact NEED');
    const payload = { capability: { name: capability }, input, policy };
    const frame = this.compactFrame('NEED', payload);
    const response = await requestJson(`${this.relayUrl}/v1/fast/needs?waitMs=${Math.max(0, Math.floor(waitMs))}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify({ frame, payload })
    });
    if (!response.result) return { ...response, frame, payload, needFrameBytes: compactFrameBytes(frame) };

    const resultEvent = response.result;
    const publicKey = await this.resolveIdentity(resultEvent.from);
    const verification = verifyCompactFrame(resultEvent.frame, resultEvent.payload, publicKey, { allowedTypes: ['RESULT'] });
    if (!verification.ok) throw new Error(`Compact RESULT verification failed: ${verification.reason}`);

    const needFrameBytes = compactFrameBytes(frame);
    const resultFrameBytes = compactFrameBytes(resultEvent.frame);
    const needPayloadBytes = bytes(payload);
    const resultPayloadBytes = bytes(resultEvent.payload);
    return {
      ok: true,
      needId: frame.i,
      provider: resultEvent.from,
      trust: resultEvent.trust || null,
      output: resultEvent.payload?.output,
      metadata: resultEvent.payload?.metadata || {},
      frame,
      payload,
      resultFrame: resultEvent.frame,
      resultPayload: resultEvent.payload,
      verification,
      needFrameBytes,
      resultFrameBytes,
      protocolOverheadBytes: needFrameBytes + resultFrameBytes,
      needPayloadBytes,
      resultPayloadBytes,
      truynPayloadBytes: needPayloadBytes + resultPayloadBytes
    };
  }

  async result(requestId, output, metadata = {}) {
    const envelope = this.envelope('RESULT', {
      requestId,
      output,
      completedAt: new Date().toISOString(),
      metadata
    });
    return requestJson(`${this.relayUrl}/v1/results`, {
      method: 'POST',
      body: JSON.stringify({ envelope })
    });
  }

  async compactResult(requestId, output, metadata = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact RESULT');
    const payload = { output, metadata };
    const frame = this.compactFrame('RESULT', payload, { id: requestId });
    const result = await requestJson(`${this.relayUrl}/v1/fast/results`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify({ frame, payload })
    });
    return {
      ...result,
      frame,
      payload,
      frameBytes: compactFrameBytes(frame),
      payloadBytes: bytes(payload)
    };
  }

  async revoke(targetId, reason = 'revoked_by_owner') {
    const envelope = this.envelope('REVOKE', { targetId, reason });
    return requestJson(`${this.relayUrl}/v1/revoke`, {
      method: 'POST',
      body: JSON.stringify({ envelope })
    });
  }

  async poll() {
    if (!this.sessionToken) throw new Error('Node must register before polling');
    const result = await requestJson(`${this.relayUrl}/v1/events?nodeId=${encodeURIComponent(this.identity.nodeId)}`, {
      headers: { authorization: `Bearer ${this.sessionToken}` }
    });

    return {
      ...result,
      events: result.events.map((event) => ({
        ...event,
        verification: verifyEnvelope(event.envelope)
      }))
    };
  }

  async pollCompact({ waitMs = 25_000 } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact polling');
    const result = await requestJson(
      `${this.relayUrl}/v1/fast/events?nodeId=${encodeURIComponent(this.identity.nodeId)}&waitMs=${Math.max(0, Math.floor(waitMs))}`,
      { headers: { authorization: `Bearer ${this.sessionToken}` } }
    );

    const events = await Promise.all((result.events || []).map(async (event) => {
      const publicKey = await this.resolveIdentity(event.from);
      return {
        ...event,
        verification: verifyCompactFrame(event.frame, event.payload, publicKey, { allowedTypes: [event.kind] })
      };
    }));
    return { ...result, events };
  }
}
