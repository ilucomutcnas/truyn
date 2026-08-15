import { createEnvelope, verifyEnvelope } from '../core/protocol/index.js';
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

export class TruynNode {
  constructor({ relayUrl, identity = createIdentity() }) {
    if (!relayUrl) throw new Error('relayUrl is required');
    this.relayUrl = relayUrl.replace(/\/$/, '');
    this.identity = identity;
    this.sessionToken = null;
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
    return requestJson(`${this.relayUrl}/v1/offers?capability=${encodeURIComponent(capability)}`);
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
}
