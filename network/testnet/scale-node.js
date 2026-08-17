import { createHash } from 'node:crypto';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { createIdentity, signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';
import { readJsonStream, requestJson, writeJsonStream } from '../transport/json-stream.js';
import {
  createQuicKademliaNode,
  firstQuicAddress,
  refreshKademliaRoutingTable
} from '../transport/quic-kademlia.js';
import { createAdversarialConnectionGater } from './adversarial-gater.js';

export const SCALE_PROBE_PROTOCOL = '/truyn/testnet/scale-probe/1.0.0';
const encoder = new TextEncoder();

export function scaleValueDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

export async function scaleContentCid(key) {
  const bytes = encoder.encode(`truyn:scale:${String(key)}`);
  return CID.createV1(raw.code, await sha256.digest(bytes));
}

function jsonBytes(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function softDeadline(promise, timeoutMs, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label}_deadline_exceeded`);
      error.code = 'ERR_TRUYN_SCALE_SOFT_DEADLINE';
      reject(error);
    }, Math.max(1, timeoutMs));
    timer.unref?.();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export class AdversarialScaleNode {
  constructor({
    index,
    listen = ['/ip4/127.0.0.1/udp/0/quic-v1'],
    announce = [],
    kBucketSize = 20,
    faultMode = 'honest',
    faultValue = null,
    delayMs = 250
  } = {}) {
    if (!Number.isInteger(index) || index < 0) throw new Error('scale node index is required');
    this.index = index;
    this.listen = listen;
    this.announce = announce;
    this.kBucketSize = kBucketSize;
    this.identity = createIdentity();
    this.gater = createAdversarialConnectionGater();
    this.node = null;
    this.faultMode = faultMode;
    this.faultValue = faultValue;
    this.delayMs = delayMs;
    this.telemetry = {
      requestsSent: 0,
      responsesReceived: 0,
      requestsHandled: 0,
      responsesDropped: 0,
      applicationBytesSent: 0,
      applicationBytesReceived: 0,
      refreshSoftDeadlines: 0,
      advertisementSoftDeadlines: 0
    };
  }

  get peerId() {
    return this.node?.peerId || null;
  }

  get peerIdString() {
    return this.node?.peerId?.toString?.() || null;
  }

  get address() {
    if (!this.node) return null;
    return firstQuicAddress(this.node);
  }

  setFault({ mode = 'honest', value = null, delayMs = this.delayMs } = {}) {
    const allowed = new Set(['honest', 'byzantine', 'colluding', 'invalid-signature', 'drop', 'delay']);
    if (!allowed.has(mode)) throw new Error(`unsupported scale fault mode: ${mode}`);
    this.faultMode = mode;
    this.faultValue = value;
    this.delayMs = delayMs;
    return this.faultSnapshot();
  }

  faultSnapshot() {
    return { mode: this.faultMode, value: this.faultValue, delayMs: this.delayMs };
  }

  async start({ bootstrap = [] } = {}) {
    if (this.node?.status === 'started') return this;
    this.node = await createQuicKademliaNode({
      listen: this.listen,
      announce: this.announce,
      bootstrap,
      kBucketSize: this.kBucketSize,
      connectionGater: this.gater.connectionGater,
      connectionManager: { maxConnections: 256 }
    });

    await this.node.handle(SCALE_PROBE_PROTOCOL, async (stream) => {
      let request;
      try {
        request = await readJsonStream(stream, { maxBytes: 64_000 });
        this.telemetry.requestsHandled += 1;
        this.telemetry.applicationBytesReceived += jsonBytes(request);

        if (this.faultMode === 'drop') {
          this.telemetry.responsesDropped += 1;
          stream.abort?.(new Error('testnet_fault_drop'));
          return;
        }
        if (this.faultMode === 'delay') {
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, this.delayMs)));
        }

        const requestedValue = request?.value;
        let responseValue = requestedValue;
        if (this.faultMode === 'byzantine') responseValue = this.faultValue ?? { forged: true, original: requestedValue };
        if (this.faultMode === 'colluding') responseValue = this.faultValue ?? { forged: 'collusion' };

        const body = {
          protocol: SCALE_PROBE_PROTOCOL,
          requestId: request?.requestId || null,
          responderNodeId: this.identity.nodeId,
          responderPeerId: this.peerIdString,
          value: responseValue,
          valueDigest: scaleValueDigest(responseValue),
          observedAt: new Date().toISOString()
        };
        const response = {
          body,
          publicKey: this.identity.publicKeyPem,
          signature: signValue(body, this.identity.privateKeyPem)
        };
        if (this.faultMode === 'invalid-signature') response.signature = `${response.signature.slice(0, -4)}AAAA`;
        this.telemetry.applicationBytesSent += jsonBytes(response);
        await writeJsonStream(stream, response, { timeoutMs: 3_000 });
      } catch (error) {
        if (stream.status !== 'closed') stream.abort?.(error);
      }
    });
    return this;
  }

  async stop() {
    if (this.node?.status === 'started') await this.node.stop();
  }

  async refresh({ timeoutMs = 8_000, externalAbort = false } = {}) {
    try {
      const refresh = refreshKademliaRoutingTable(this.node, { timeoutMs, externalAbort });
      return externalAbort ? refresh : await softDeadline(refresh, timeoutMs + 2_000, `truyn_scale_refresh_${this.index}`);
    } catch (error) {
      if (error.code === 'ERR_TRUYN_SCALE_SOFT_DEADLINE') this.telemetry.refreshSoftDeadlines += 1;
      throw error;
    }
  }

  async advertise(key, { timeoutMs = 8_000, externalAbort = false } = {}) {
    const cid = key instanceof CID ? key : await scaleContentCid(key);
    const options = externalAbort ? { signal: AbortSignal.timeout(timeoutMs) } : {};
    try {
      const publication = this.node.contentRouting.provide(cid, options);
      if (externalAbort) await publication;
      else await softDeadline(publication, timeoutMs + 4_000, `truyn_scale_provide_${this.index}`);
      return cid;
    } catch (error) {
      if (error.code === 'ERR_TRUYN_SCALE_SOFT_DEADLINE') this.telemetry.advertisementSoftDeadlines += 1;
      throw error;
    }
  }

  async findProviders(key, { timeoutMs = 5_000, limit = 20 } = {}) {
    const cid = key instanceof CID ? key : await scaleContentCid(key);
    const providers = [];
    const seen = new Set();
    for await (const provider of this.node.contentRouting.findProviders(cid, { signal: AbortSignal.timeout(timeoutMs) })) {
      const id = provider.id.toString();
      if (seen.has(id)) continue;
      seen.add(id);
      providers.push(provider);
      if (providers.length >= limit) break;
    }
    return providers;
  }

  async probe(targetPeerId, value, { expectedDigest = scaleValueDigest(value), timeoutMs = 3_000, requestId = null } = {}) {
    const request = {
      requestId: requestId || `scale-${this.index}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      value
    };
    const started = performance.now();
    this.telemetry.requestsSent += 1;
    this.telemetry.applicationBytesSent += jsonBytes(request);
    try {
      const response = await requestJson(this.node, targetPeerId, SCALE_PROBE_PROTOCOL, request, { timeoutMs, maxBytes: 64_000 });
      const latencyMs = performance.now() - started;
      this.telemetry.responsesReceived += 1;
      this.telemetry.applicationBytesReceived += jsonBytes(response);
      const computedNodeId = response?.publicKey ? nodeIdFromPublicKey(response.publicKey) : null;
      const signatureOk = Boolean(response?.body && response?.signature && response?.publicKey && verifyValue(response.body, response.signature, response.publicKey));
      const selfDigestOk = Boolean(response?.body && response.body.valueDigest === scaleValueDigest(response.body.value));
      const requestBound = response?.body?.requestId === request.requestId;
      const identityBound = computedNodeId != null && computedNodeId === response?.body?.responderNodeId;
      const expectedDigestOk = response?.body?.valueDigest === expectedDigest;
      return {
        ok: signatureOk && selfDigestOk && requestBound && identityBound && expectedDigestOk,
        signatureOk,
        selfDigestOk,
        requestBound,
        identityBound,
        expectedDigestOk,
        latencyMs,
        response
      };
    } catch (error) {
      return { ok: false, transportError: error.code || error.message, latencyMs: performance.now() - started };
    }
  }

  async blockPeers(peerIds = []) {
    this.gater.block(peerIds);
    for (const peerId of peerIds) {
      try {
        await this.node.hangUp(peerId);
      } catch {
        // The peer may already be disconnected; the gater still prevents redial.
      }
    }
    return this.gater.snapshot();
  }

  healPeers(peerIds = []) {
    if (peerIds.length === 0) return this.gater.heal();
    return this.gater.allow(peerIds);
  }

  snapshot() {
    return {
      index: this.index,
      nodeId: this.identity.nodeId,
      peerId: this.peerIdString,
      address: this.address,
      status: this.node?.status || 'stopped',
      connectedPeers: this.node?.getPeers?.().length || 0,
      routingTableSize: this.node?.services?.dht?.routingTable?.size ?? null,
      blockedPeers: this.gater.snapshot(),
      fault: this.faultSnapshot(),
      telemetry: { ...this.telemetry }
    };
  }
}