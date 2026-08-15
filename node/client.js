import WebSocket from 'ws';
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
    this.fastSocket = null;
    this.fastSocketConnectPromise = null;
    this.fastSocketQueue = [];
    this.fastSocketWaiters = [];
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
    this.closeFastSocket();
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

  async compactChain(stages, { waitMs = 120_000 } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact CHAIN');
    if (!Array.isArray(stages) || stages.length < 2) throw new Error('compactChain requires at least two stages');
    const payload = { stages };
    const frame = this.compactFrame('CHAIN', payload);
    const response = await requestJson(`${this.relayUrl}/v1/fast/chains?waitMs=${Math.max(0, Math.floor(waitMs))}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify({ frame, payload })
    });

    const verifiedResults = [];
    for (const event of response.results || []) {
      const publicKey = await this.resolveIdentity(event.from);
      const verification = verifyCompactFrame(event.frame, event.payload, publicKey, { allowedTypes: ['RESULT'] });
      if (!verification.ok) throw new Error(`Compact CHAIN RESULT verification failed: ${verification.reason}`);
      verifiedResults.push({ ...event, verification });
    }

    const chainFrameBytes = compactFrameBytes(frame);
    const resultFrameBytes = verifiedResults.map((event) => compactFrameBytes(event.frame));
    const resultPayloadBytes = verifiedResults.map((event) => bytes(event.payload));
    return {
      ...response,
      frame,
      payload,
      results: verifiedResults,
      chainFrameBytes,
      resultFrameBytes,
      protocolOverheadBytes: chainFrameBytes + resultFrameBytes.reduce((sum, value) => sum + value, 0),
      chainPayloadBytes: bytes(payload),
      resultPayloadBytes,
      truynPayloadBytes: bytes(payload) + resultPayloadBytes.reduce((sum, value) => sum + value, 0)
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

  fastSocketUrl() {
    const socketUrl = new URL(this.relayUrl);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.pathname = '/v1/fast/socket';
    socketUrl.search = '';
    socketUrl.searchParams.set('nodeId', this.identity.nodeId);
    return socketUrl.toString();
  }

  rejectFastSocketWaiters(error) {
    const waiters = this.fastSocketWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  deliverFastSocketEvent(event) {
    const waiter = this.fastSocketWaiters.shift();
    if (waiter) waiter.resolve(event);
    else this.fastSocketQueue.push(event);
  }

  async ensureFastSocket() {
    if (!this.sessionToken) throw new Error('Node must register before opening fast socket');
    if (this.fastSocket?.readyState === WebSocket.OPEN) return this.fastSocket;
    if (this.fastSocketConnectPromise) return this.fastSocketConnectPromise;

    this.fastSocketConnectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.fastSocketUrl(), {
        headers: { authorization: `Bearer ${this.sessionToken}` },
        perMessageDeflate: false,
        handshakeTimeout: 10_000
      });
      let opened = false;

      socket.once('open', () => {
        opened = true;
        this.fastSocket = socket;
        this.fastSocketConnectPromise = null;
        resolve(socket);
      });
      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message?.kind === 'ACK') return;
          if (message?.kind === 'ERROR') {
            this.rejectFastSocketWaiters(new Error(message.error || 'fast_socket_error'));
            return;
          }
          this.deliverFastSocketEvent(message);
        } catch (error) {
          this.rejectFastSocketWaiters(error);
        }
      });
      socket.on('error', (error) => {
        if (!opened) {
          this.fastSocketConnectPromise = null;
          reject(error);
        }
      });
      socket.on('close', () => {
        if (this.fastSocket === socket) this.fastSocket = null;
        if (!opened) this.fastSocketConnectPromise = null;
        this.rejectFastSocketWaiters(new Error('fast_socket_closed'));
      });
    });
    return this.fastSocketConnectPromise;
  }

  closeFastSocket() {
    const socket = this.fastSocket;
    this.fastSocket = null;
    this.fastSocketConnectPromise = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      try { socket.close(1000, 'client_close'); } catch {}
    }
    this.rejectFastSocketWaiters(new Error('fast_socket_closed'));
  }

  async verifyCompactEvent(event) {
    const publicKey = await this.resolveIdentity(event.from);
    const signedType = event.signedType || event.kind;
    const verification = verifyCompactFrame(event.frame, event.payload, publicKey, { allowedTypes: [signedType] });
    let priorVerification = null;
    if (event.priorResult) {
      const priorPublicKey = await this.resolveIdentity(event.priorResult.from);
      priorVerification = verifyCompactFrame(
        event.priorResult.frame,
        event.priorResult.payload,
        priorPublicKey,
        { allowedTypes: ['RESULT'] }
      );
    }
    return { ...event, verification, priorVerification };
  }

  async nextCompactSocketEvent({ timeoutMs = 0 } = {}) {
    await this.ensureFastSocket();
    if (this.fastSocketQueue.length > 0) {
      return this.verifyCompactEvent(this.fastSocketQueue.shift());
    }

    const event = await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.fastSocketWaiters.indexOf(waiter);
          if (index >= 0) this.fastSocketWaiters.splice(index, 1);
          reject(new Error('fast_socket_event_timeout'));
        }, timeoutMs);
        const originalResolve = waiter.resolve;
        waiter.resolve = (value) => {
          clearTimeout(waiter.timer);
          originalResolve(value);
        };
        const originalReject = waiter.reject;
        waiter.reject = (error) => {
          clearTimeout(waiter.timer);
          originalReject(error);
        };
      }
      this.fastSocketWaiters.push(waiter);
    });
    return this.verifyCompactEvent(event);
  }

  async compactResult(requestId, output, metadata = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact RESULT');
    const payload = { output, metadata };
    const frame = this.compactFrame('RESULT', payload, { id: requestId });

    if (this.fastSocket?.readyState === WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.fastSocket.send(JSON.stringify({ kind: 'RESULT', frame, payload }), (error) => error ? reject(error) : resolve());
      });
      return {
        ok: true,
        transport: 'websocket',
        requestId,
        frame,
        payload,
        frameBytes: compactFrameBytes(frame),
        payloadBytes: bytes(payload)
      };
    }

    const result = await requestJson(`${this.relayUrl}/v1/fast/results`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify({ frame, payload })
    });
    return {
      ...result,
      transport: 'http',
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
      events: result.events.map((event) => ({ ...event, verification: verifyEnvelope(event.envelope) }))
    };
  }

  async pollCompact({ waitMs = 25_000 } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before compact polling');
    const result = await requestJson(
      `${this.relayUrl}/v1/fast/events?nodeId=${encodeURIComponent(this.identity.nodeId)}&waitMs=${Math.max(0, Math.floor(waitMs))}`,
      { headers: { authorization: `Bearer ${this.sessionToken}` } }
    );
    const events = await Promise.all((result.events || []).map((event) => this.verifyCompactEvent(event)));
    return { ...result, events };
  }
}
