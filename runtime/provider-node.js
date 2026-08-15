import { TruynNode } from '../node/client.js';
import { PROVIDER_BACKCHANNEL_HEADER } from '../core/security/node-backchannel.js';

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

export class ProviderTruynNode extends TruynNode {
  constructor({ relayUrl, identity, backchannelToken = null }) {
    super({ relayUrl, identity });
    this.backchannelToken = String(backchannelToken || '').trim() || null;
  }

  backchannelHeaders() {
    return this.backchannelToken ? { [PROVIDER_BACKCHANNEL_HEADER]: this.backchannelToken } : {};
  }

  authHeaders() {
    return {
      ...super.authHeaders(),
      ...this.backchannelHeaders()
    };
  }

  async register({ name = null, protocols = ['TRUYN/1'] } = {}) {
    if (!this.backchannelToken) return super.register({ name, protocols });
    this.closeFastSocket();
    const envelope = this.envelope('IDENTITY', {
      nodeId: this.identity.nodeId,
      algorithm: this.identity.algorithm,
      protocols,
      name
    });
    const result = await requestJson(`${this.relayUrl}/v1/register`, {
      method: 'POST',
      headers: this.backchannelHeaders(),
      body: JSON.stringify({ envelope })
    });
    this.sessionToken = result.sessionToken;
    return result;
  }
}
