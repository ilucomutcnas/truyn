import WebSocket from 'ws';
import { compactFrameBytes, createCompactFrame, createEnvelope, verifyCompactFrame, verifyEnvelope } from '../core/protocol/index.js';
import { createIdentity } from '../core/identity/index.js';
import { contextQueryHash, renderContextSelection, verifyContextManifest, verifyContextSelection } from '../core/context/index.js';

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
    this.fastSocketChainWaiters = new Map();
    this.contextManifestCache = new Map();
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

  requireSession(action = 'using the relay') {
    if (!this.sessionToken) throw new Error(`Node must register before ${action}`);
  }

  authHeaders() {
    this.requireSession();
    return { authorization: `Bearer ${this.sessionToken}` };
  }

  rememberIdentity(nodeId, publicKeyPem) {
    if (nodeId && publicKeyPem) this.identityCache.set(nodeId, publicKeyPem);
  }

  async resolveIdentity(nodeId) {
    if (this.identityCache.has(nodeId)) return this.identityCache.get(nodeId);
    const result = await requestJson(`${this.relayUrl}/v1/nodes/${encodeURIComponent(nodeId)}`, {
      headers: this.authHeaders()
    });
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
    this.requireSession('publishing an OFFER');
    const envelope = this.envelope('OFFER', {
      capability: { name: capability },
      metadata
    });
    return requestJson(`${this.relayUrl}/v1/offers`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ envelope })
    });
  }

  async find(capability) {
    this.requireSession('discovering providers');
    const result = await requestJson(`${this.relayUrl}/v1/offers?capability=${encodeURIComponent(capability)}`, {
      headers: this.authHeaders()
    });
    for (const offer of result.offers || []) this.rememberIdentity(offer.from, offer.publicKey);
    return result;
  }

  async need(capability, input, policy = {}) {
    this.requireSession('sending a NEED');
    const envelope = this.envelope('NEED', {
      capability: { name: capability },
      input,
      policy
    });
    return requestJson(`${this.relayUrl}/v1/needs`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ envelope })
    });
  }

  async compactNeed(capability, input, policy = {}, { waitMs = 120_000 } = {}) {
    this.requireSession('sending a compact NEED');
    const payload = { capability: { name: capability }, input, policy };
    const frame = this.compactFrame('NEED', payload);
    const response = await requestJson(`${this.relayUrl}/v1/fast/needs?waitMs=${Math.max(0, Math.floor(waitMs))}`, {
      method: 'POST',
      headers: this.authHeaders(),
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
    this.requireSession('sending a compact CHAIN');
    if (!Array.isArray(stages) || stages.length < 2) throw new Error('compactChain requires at least two stages');
    const payload = { stages };
    const frame = this.compactFrame('CHAIN', payload);
    const boundedWait = Math.max(0, Math.min(120_000, Math.floor(waitMs)));
    let response;
    let requesterTransport = 'http';
    if (this.fastSocket?.readyState === WebSocket.OPEN) {
      requesterTransport = 'websocket';
      response = await new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          if (this.fastSocketChainWaiters.get(frame.i) === waiter) this.fastSocketChainWaiters.delete(frame.i);
          reject(new Error('fast_socket_chain_timeout'));
        }, boundedWait || 120_000);
        this.fastSocketChainWaiters.set(frame.i, waiter);
        this.fastSocket.send(JSON.stringify({ kind: 'CHAIN', frame, payload, waitMs: boundedWait }), (error) => {
          if (!error) return;
          if (this.fastSocketChainWaiters.get(frame.i) === waiter) this.fastSocketChainWaiters.delete(frame.i);
          clearTimeout(waiter.timer);
          reject(error);
        });
      });
    } else {
      response = await requestJson(`${this.relayUrl}/v1/fast/chains?waitMs=${boundedWait}`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({ frame, payload })
      });
    }
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
      requesterTransport,
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
    this.requireSession('sending a RESULT');
    const envelope = this.envelope('RESULT', {
      requestId,
      output,
      completedAt: new Date().toISOString(),
      metadata
    });
    return requestJson(`${this.relayUrl}/v1/results`, {
      method: 'POST',
      headers: this.authHeaders(),
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

  rejectFastSocketChainWaiters(error) {
    const waiters = [...this.fastSocketChainWaiters.values()];
    this.fastSocketChainWaiters.clear();
    for (const waiter of waiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  deliverFastSocketEvent(event) {
    const waiter = this.fastSocketWaiters.shift();
    if (waiter) waiter.resolve(event);
    else this.fastSocketQueue.push(event);
  }

  async ensureFastSocket() {
    this.requireSession('opening the fast socket');
    if (this.fastSocket?.readyState === WebSocket.OPEN) return this.fastSocket;
    if (this.fastSocketConnectPromise) return this.fastSocketConnectPromise;
    this.fastSocketConnectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.fastSocketUrl(), {
        headers: this.authHeaders(),
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
          if (message?.kind === 'CHAIN_RESULT') {
            const waiter = this.fastSocketChainWaiters.get(message.chainId);
            if (!waiter) return;
            this.fastSocketChainWaiters.delete(message.chainId);
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.resolve(message);
            return;
          }
          if (message?.kind === 'ERROR') {
            const error = new Error(message.error || 'fast_socket_error');
            if (message.chainId) {
              const waiter = this.fastSocketChainWaiters.get(message.chainId);
              if (waiter) {
                this.fastSocketChainWaiters.delete(message.chainId);
                if (waiter.timer) clearTimeout(waiter.timer);
                waiter.reject(error);
                return;
              }
            }
            this.rejectFastSocketWaiters(error);
            this.rejectFastSocketChainWaiters(error);
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
        const closeError = new Error('fast_socket_closed');
        this.rejectFastSocketWaiters(closeError);
        this.rejectFastSocketChainWaiters(closeError);
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
    const closeError = new Error('fast_socket_closed');
    this.rejectFastSocketWaiters(closeError);
    this.rejectFastSocketChainWaiters(closeError);
  }

  async verifyCompactEvent(event) {
    const publicKey = await this.resolveIdentity(event.from);
    const signedType = event.signedType || event.kind;
    const verification = verifyCompactFrame(event.frame, event.payload, publicKey, { allowedTypes: [signedType] });
    let priorVerification = null;
    if (event.priorResult) {
      const priorPublicKey = await this.resolveIdentity(event.priorResult.from);
      priorVerification = verifyCompactFrame(event.priorResult.frame, event.priorResult.payload, priorPublicKey, { allowedTypes: ['RESULT'] });
    }
    return { ...event, verification, priorVerification };
  }

  async nextCompactSocketEvent({ timeoutMs = 0 } = {}) {
    await this.ensureFastSocket();
    if (this.fastSocketQueue.length > 0) return this.verifyCompactEvent(this.fastSocketQueue.shift());
    const event = await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.fastSocketWaiters.indexOf(waiter);
          if (index >= 0) this.fastSocketWaiters.splice(index, 1);
          reject(new Error('fast_socket_event_timeout'));
        }, timeoutMs);
        const originalResolve = waiter.resolve;
        waiter.resolve = (value) => { clearTimeout(waiter.timer); originalResolve(value); };
        const originalReject = waiter.reject;
        waiter.reject = (error) => { clearTimeout(waiter.timer); originalReject(error); };
      }
      this.fastSocketWaiters.push(waiter);
    });
    return this.verifyCompactEvent(event);
  }

  async compactResult(requestId, output, metadata = {}) {
    this.requireSession('sending a compact RESULT');
    const payload = { output, metadata };
    const frame = this.compactFrame('RESULT', payload, { id: requestId });
    if (this.fastSocket?.readyState === WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.fastSocket.send(JSON.stringify({ kind: 'RESULT', frame, payload }), (error) => error ? reject(error) : resolve());
      });
      return { ok: true, transport: 'websocket', requestId, frame, payload, frameBytes: compactFrameBytes(frame), payloadBytes: bytes(payload) };
    }
    const result = await requestJson(`${this.relayUrl}/v1/fast/results`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ frame, payload })
    });
    return { ...result, transport: 'http', frame, payload, frameBytes: compactFrameBytes(frame), payloadBytes: bytes(payload) };
  }

  async putContext(blocks, { readers = [], metadata = {} } = {}) {
    this.requireSession('putting context');
    const payload = { blocks, readers, metadata };
    const frame = this.compactFrame('CONTEXT_PUT', payload);
    const requestBody = { frame, payload };
    const result = await requestJson(`${this.relayUrl}/v1/contexts`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(requestBody)
    });
    if (result.manifest) this.contextManifestCache.set(result.cid, result.manifest);
    return { ...result, frame, payload, transferBytes: bytes(requestBody) + bytes(result) };
  }

  async deltaContext(baseCid, ops, { readers = [], metadata = {} } = {}) {
    this.requireSession('updating context');
    const payload = { baseCid, ops, readers, metadata };
    const frame = this.compactFrame('CONTEXT_DELTA', payload);
    const requestBody = { frame, payload };
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(baseCid)}/delta`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(requestBody)
    });
    if (result.manifest) this.contextManifestCache.set(result.cid, result.manifest);
    return { ...result, frame, payload, transferBytes: bytes(requestBody) + bytes(result) };
  }

  async contextManifest(cid) {
    this.requireSession('reading context');
    if (this.contextManifestCache.has(cid)) return { manifest: this.contextManifestCache.get(cid), cacheHit: true, transferBytes: 0 };
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(cid)}/manifest`, { headers: this.authHeaders() });
    const verification = verifyContextManifest(result.manifest, cid);
    if (!verification.ok) throw new Error(`Context manifest verification failed: ${verification.reason}`);
    this.contextManifestCache.set(cid, result.manifest);
    return { manifest: result.manifest, cacheHit: false, transferBytes: bytes(result) };
  }

  async selectContext(cid, ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Context selection requires block ids');
    const manifestResult = await this.contextManifest(cid);
    const requestBody = { ids };
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(cid)}/select`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(requestBody)
    });
    const verification = verifyContextSelection(manifestResult.manifest, result.blocks, cid);
    if (!verification.ok) throw new Error(`Context selection verification failed: ${verification.reason}`);
    const selectedContentBytes = (result.blocks || []).reduce((sum, block) => sum + Buffer.byteLength(block.text || ''), 0);
    return { cid, blocks: result.blocks || [], manifestCacheHit: manifestResult.cacheHit, manifestTransferBytes: manifestResult.transferBytes, selectionTransferBytes: bytes(requestBody) + bytes(result), transferBytes: manifestResult.transferBytes + bytes(requestBody) + bytes(result), selectedContentBytes };
  }

  async retrieveContext(cid, query, { topK = 1 } = {}) {
    if (typeof query !== 'string' || query.trim().length < 3) throw new Error('Context retrieval requires a query');
    const manifestResult = await this.contextManifest(cid);
    const requestBody = { query, topK };
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(cid)}/retrieve`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(requestBody)
    });
    const verification = verifyContextSelection(manifestResult.manifest, result.blocks, cid);
    if (!verification.ok) throw new Error(`Context retrieval verification failed: ${verification.reason}`);
    const retrieval = result.retrieval || {};
    if (retrieval.rootCid !== cid || retrieval.manifestCid !== cid) throw new Error('Context retrieval provenance root mismatch');
    if (retrieval.queryHash !== contextQueryHash(query)) throw new Error('Context retrieval query hash mismatch');
    const proof = Array.isArray(retrieval.selected) ? retrieval.selected : [];
    if (proof.length !== (result.blocks || []).length) throw new Error('Context retrieval provenance selection mismatch');
    for (let index = 0; index < proof.length; index += 1) {
      const block = result.blocks[index];
      if (proof[index].id !== block.id || proof[index].cid !== block.cid || proof[index].rank !== index + 1) throw new Error('Context retrieval provenance block mismatch');
    }
    const selectedContentBytes = (result.blocks || []).reduce((sum, block) => sum + Buffer.byteLength(block.text || ''), 0);
    return { cid, blocks: result.blocks || [], retrieval, provenanceVerified: true, manifestCacheHit: manifestResult.cacheHit, manifestTransferBytes: manifestResult.transferBytes, retrievalTransferBytes: bytes(requestBody) + bytes(result), transferBytes: manifestResult.transferBytes + bytes(requestBody) + bytes(result), selectedContentBytes };
  }

  async materializeContextRefs(value) {
    const emptyStats = () => ({ contextRefs: 0, selectedBlocks: 0, selectedContentBytes: 0, manifestTransferBytes: 0, selectionTransferBytes: 0, contextTransferBytes: 0, retrievalQueries: 0, provenanceVerifiedRefs: 0 });
    const merge = (target, source) => { for (const key of Object.keys(target)) target[key] += source[key] || 0; return target; };
    const walk = async (item) => {
      if (Array.isArray(item)) {
        const stats = emptyStats();
        const values = [];
        for (const child of item) { const resolved = await walk(child); values.push(resolved.value); merge(stats, resolved.stats); }
        return { value: values, stats };
      }
      if (item && typeof item === 'object') {
        if (Object.keys(item).length === 1 && item.$context) {
          const ref = item.$context;
          if (!ref.cid) throw new Error('Invalid $context reference');
          let selected;
          let retrievalQueries = 0;
          let provenanceVerifiedRefs = 0;
          if (Array.isArray(ref.ids) && ref.ids.length > 0) selected = await this.selectContext(ref.cid, ref.ids);
          else if (typeof ref.query === 'string' && ref.query.trim()) {
            selected = await this.retrieveContext(ref.cid, ref.query, { topK: ref.topK || 1 });
            retrievalQueries = 1;
            provenanceVerifiedRefs = selected.provenanceVerified ? 1 : 0;
          } else throw new Error('Invalid $context reference');
          return {
            value: renderContextSelection(selected.blocks),
            stats: { contextRefs: 1, selectedBlocks: selected.blocks.length, selectedContentBytes: selected.selectedContentBytes, manifestTransferBytes: selected.manifestTransferBytes, selectionTransferBytes: selected.selectionTransferBytes || selected.retrievalTransferBytes || 0, contextTransferBytes: selected.transferBytes, retrievalQueries, provenanceVerifiedRefs }
          };
        }
        const stats = emptyStats();
        const entries = [];
        for (const [key, child] of Object.entries(item)) { const resolved = await walk(child); entries.push([key, resolved.value]); merge(stats, resolved.stats); }
        return { value: Object.fromEntries(entries), stats };
      }
      return { value: item, stats: emptyStats() };
    };
    return walk(value);
  }

  async revoke(targetId, reason = 'revoked_by_owner') {
    this.requireSession('revoking an object');
    const envelope = this.envelope('REVOKE', { targetId, reason });
    return requestJson(`${this.relayUrl}/v1/revoke`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ envelope })
    });
  }

  async poll() {
    this.requireSession('polling');
    const result = await requestJson(`${this.relayUrl}/v1/events?nodeId=${encodeURIComponent(this.identity.nodeId)}`, { headers: this.authHeaders() });
    return { ...result, events: result.events.map((event) => ({ ...event, verification: verifyEnvelope(event.envelope) })) };
  }

  async pollCompact({ waitMs = 25_000 } = {}) {
    this.requireSession('compact polling');
    const result = await requestJson(`${this.relayUrl}/v1/fast/events?nodeId=${encodeURIComponent(this.identity.nodeId)}&waitMs=${Math.max(0, Math.floor(waitMs))}`, { headers: this.authHeaders() });
    const events = await Promise.all((result.events || []).map((event) => this.verifyCompactEvent(event)));
    return { ...result, events };
  }
}
