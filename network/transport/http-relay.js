import { verifyEnvelope } from '../../core/protocol/index.js';

function relayError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function responseJson(response, fallbackCode) {
  let body = null;
  try { body = await response.json(); } catch { /* bounded protocol error below */ }
  if (!response.ok) throw relayError(body?.error || fallbackCode);
  if (!body || typeof body !== 'object') throw relayError('TRUYN_RELAY_INVALID_RESPONSE');
  return body;
}

function authHeaders(token, extra = {}) {
  return token ? { ...extra, authorization: `Bearer ${token}` } : extra;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw relayError('TRUYN_RELAY_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function acceptRelayedEnvelope(node, envelope, { relayMessageId = null } = {}) {
  if (!node?.started) throw relayError('TRUYN_RELAY_NODE_NOT_STARTED');
  const verification = verifyEnvelope(envelope);
  if (!verification.ok) throw relayError(`TRUYN_RELAY_INVALID_ENVELOPE:${verification.reason}`);
  if (envelope.to !== node.identity?.nodeId) throw relayError('TRUYN_RELAY_RECIPIENT_MISMATCH');
  if (typeof node.envelopeHandler !== 'function') throw relayError('TRUYN_NO_ENVELOPE_HANDLER');

  const context = {
    peerNodeId: envelope.from,
    transport: 'relay',
    authentication: 'ed25519-envelope',
    relayMessageId
  };
  if (!node.workInbox) return node.envelopeHandler(envelope, context);
  return node.workInbox.run(envelope, context, node.envelopeHandler);
}

export class HttpPollingRelayClient {
  constructor({
    baseUrl,
    nodeId,
    token = '',
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = 30_000,
    relayTimeoutMs = 45_000,
    pollWaitMs = 10_000,
    resultPollMs = 75
  } = {}) {
    if (!baseUrl) throw new Error('relay baseUrl is required');
    if (!nodeId) throw new Error('relay nodeId is required');
    if (typeof fetchImpl !== 'function') throw new Error('relay fetch implementation is required');
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.nodeId = nodeId;
    this.token = token;
    this.fetch = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.relayTimeoutMs = relayTimeoutMs;
    this.pollWaitMs = pollWaitMs;
    this.resultPollMs = resultPollMs;
    this.running = false;
    this.receiverPromise = null;
  }

  async #json(path, { method = 'GET', body = null, timeoutMs = this.requestTimeoutMs } = {}) {
    const response = await fetchWithTimeout(this.fetch, `${this.baseUrl}${path}`, {
      method,
      headers: authHeaders(this.token, body == null ? {} : { 'content-type': 'application/json' }),
      body: body == null ? undefined : JSON.stringify(body)
    }, timeoutMs);
    return responseJson(response, 'TRUYN_RELAY_HTTP_ERROR');
  }

  async fallback(peerNodeId, envelope) {
    const verification = verifyEnvelope(envelope);
    if (!verification.ok) throw relayError(`TRUYN_RELAY_INVALID_ENVELOPE:${verification.reason}`);
    if (envelope.from !== this.nodeId) throw relayError('TRUYN_RELAY_SENDER_MISMATCH');
    if (envelope.to !== peerNodeId) throw relayError('TRUYN_RELAY_TARGET_MISMATCH');

    const accepted = await this.#json('/v1/relay', { method: 'POST', body: { envelope } });
    if (!accepted.id) throw relayError('TRUYN_RELAY_MISSING_MESSAGE_ID');
    const deadline = Date.now() + this.relayTimeoutMs;
    while (Date.now() < deadline) {
      const response = await fetchWithTimeout(this.fetch,
        `${this.baseUrl}/v1/result?id=${encodeURIComponent(accepted.id)}`,
        { headers: authHeaders(this.token) }, this.requestTimeoutMs);
      if (response.status === 204) {
        await new Promise((resolve) => setTimeout(resolve, this.resultPollMs));
        continue;
      }
      const body = await responseJson(response, 'TRUYN_RELAY_RESULT_ERROR');
      if (body.error) throw relayError(body.error);
      return body.result;
    }
    throw relayError('TRUYN_RELAY_TIMEOUT');
  }

  async #pollOnce(node) {
    const response = await fetchWithTimeout(this.fetch,
      `${this.baseUrl}/v1/poll?nodeId=${encodeURIComponent(this.nodeId)}&waitMs=${this.pollWaitMs}`,
      { headers: authHeaders(this.token) }, this.pollWaitMs + 5_000);
    if (response.status === 204) return;
    const message = await responseJson(response, 'TRUYN_RELAY_POLL_ERROR');
    if (!message.id || !message.envelope) throw relayError('TRUYN_RELAY_INVALID_DELIVERY');

    try {
      const result = await acceptRelayedEnvelope(node, message.envelope, { relayMessageId: message.id });
      await this.#json('/v1/complete', {
        method: 'POST',
        body: { id: message.id, nodeId: this.nodeId, result: result ?? null }
      });
    } catch (error) {
      await this.#json('/v1/complete', {
        method: 'POST',
        body: { id: message.id, nodeId: this.nodeId, error: error?.code || 'TRUYN_RELAY_RECIPIENT_REJECTED' }
      }).catch(() => {});
    }
  }

  startReceiver(node) {
    if (this.running) return this.receiverPromise;
    this.running = true;
    this.receiverPromise = (async () => {
      while (this.running) {
        try {
          await this.#pollOnce(node);
        } catch (error) {
          if (!this.running) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    })();
    return this.receiverPromise;
  }

  async stopReceiver() {
    this.running = false;
    if (this.receiverPromise) await Promise.race([
      this.receiverPromise,
      new Promise((resolve) => setTimeout(resolve, this.pollWaitMs + 5_500))
    ]);
    this.receiverPromise = null;
  }
}
