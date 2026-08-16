import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { readJsonStream, requestJson, writeJsonStream } from '../transport/json-stream.js';

export const TRANSPARENCY_REPLICATION_PROTOCOL = '/truyn/transparency/2.0.0';

export async function transparencyReplicationCid(sourceOwnerId) {
  const bytes = new TextEncoder().encode(`truyn:transparency:${sourceOwnerId}`);
  return CID.createV1(raw.code, await sha256.digest(bytes));
}

export class ReplicatedTransparencyService {
  constructor({ node, log, maxMessageBytes = 4_194_304, routingTimeoutMs = 5_000 } = {}) {
    if (!node || !log) throw new Error('replicated transparency node and log are required');
    this.node = node;
    this.log = log;
    this.maxMessageBytes = maxMessageBytes;
    this.routingTimeoutMs = routingTimeoutMs;
    this.started = false;
    this.advertisingEnabled = false;
    this.advertisePromise = null;
    this.churnListenerInstalled = false;
  }

  async start({ advertise = true } = {}) {
    await this.log.open();
    if (!this.started) {
      await this.node.handle(TRANSPARENCY_REPLICATION_PROTOCOL, async (stream) => {
        const request = await readJsonStream(stream, { maxBytes: this.maxMessageBytes });
        try {
          if (request?.logId !== this.log.logId) {
            await writeJsonStream(stream, { ok: false, error: 'transparency_log_not_found' });
            return;
          }
          if (request.type === 'HEAD') {
            await writeJsonStream(stream, { ok: true, head: this.log.head() });
            return;
          }
          if (request.type === 'PULL') {
            const fromSequence = Number.isInteger(request.fromSequence) && request.fromSequence > 0 ? request.fromSequence : 1;
            await writeJsonStream(stream, { ok: true, head: this.log.head(), entries: this.log.entries({ fromSequence }) });
            return;
          }
          if (request.type === 'PUSH') {
            await this.log.ingest(request.entries || []);
            await writeJsonStream(stream, { ok: true, head: this.log.head() });
            return;
          }
          await writeJsonStream(stream, { ok: false, error: 'transparency_operation_unsupported' });
        } catch (error) {
          await writeJsonStream(stream, { ok: false, error: error.code || error.message });
        }
      });
      this.started = true;
    }
    if (!this.churnListenerInstalled) {
      this.node.addEventListener('peer:disconnect', () => this.#scheduleChurnReannounce());
      this.churnListenerInstalled = true;
    }
    if (advertise) {
      try {
        await this.advertise();
      } catch (error) {
        // An empty newcomer may be unable to publish during topology churn before
        // it has recovered a verified log. Keep the RPC service alive so it can
        // discover a surviving replica and only advertise after signed recovery.
        if (this.log.head().sequence > 0) throw error;
      }
    }
    return this.log.head();
  }

  #scheduleChurnReannounce() {
    if (!this.advertisingEnabled) return;
    for (const delayMs of [0, 250, 1_000]) {
      const timer = setTimeout(() => {
        if (this.node.status !== 'started' || !this.advertisingEnabled) return;
        this.advertise().catch(() => {});
      }, delayMs);
      timer.unref?.();
    }
  }

  async advertise() {
    if (this.advertisePromise) return this.advertisePromise;
    this.advertisePromise = (async () => {
      const cid = await transparencyReplicationCid(this.log.sourceOwnerId);
      await this.node.contentRouting.provide(cid, { signal: AbortSignal.timeout(this.routingTimeoutMs) });
      this.advertisingEnabled = true;
    })();
    try {
      await this.advertisePromise;
    } finally {
      this.advertisePromise = null;
    }
  }

  async #headFor(peerId, timeoutMs) {
    const response = await requestJson(this.node, peerId, TRANSPARENCY_REPLICATION_PROTOCOL, { type: 'HEAD', logId: this.log.logId }, { timeoutMs, maxBytes: 64_000 });
    if (!response?.ok || !response.head) throw new Error(response?.error || 'transparency_peer_head_failed');
    return response.head;
  }

  async syncWithPeer(peerId, { timeoutMs = 5_000 } = {}) {
    const remote = await this.#headFor(peerId, timeoutMs);
    let local = this.log.head();
    if (remote.sequence === local.sequence && remote.headHash !== local.headHash) {
      const error = new Error('transparency_fork_detected');
      error.code = 'transparency_fork_detected';
      throw error;
    }
    if (remote.sequence > local.sequence) {
      const response = await requestJson(this.node, peerId, TRANSPARENCY_REPLICATION_PROTOCOL, {
        type: 'PULL', logId: this.log.logId, fromSequence: local.sequence + 1
      }, { timeoutMs, maxBytes: this.maxMessageBytes });
      if (!response?.ok) throw new Error(response?.error || 'transparency_pull_failed');
      await this.log.ingest(response.entries || []);
      local = this.log.head();
      if (response.head?.headHash !== local.headHash) throw new Error('transparency_pull_head_mismatch');
      if (!this.advertisingEnabled && local.sequence > 0) await this.advertise();
      return { direction: 'pull', head: local, peerId: peerId.toString() };
    }
    if (local.sequence > remote.sequence) {
      const response = await requestJson(this.node, peerId, TRANSPARENCY_REPLICATION_PROTOCOL, {
        type: 'PUSH', logId: this.log.logId, entries: this.log.entries({ fromSequence: remote.sequence + 1 })
      }, { timeoutMs, maxBytes: this.maxMessageBytes });
      if (!response?.ok) throw new Error(response?.error || 'transparency_push_failed');
      if (response.head?.headHash !== local.headHash) throw new Error('transparency_push_head_mismatch');
      return { direction: 'push', head: local, peerId: peerId.toString() };
    }
    return { direction: 'equal', head: local, peerId: peerId.toString() };
  }

  async discoverReplicaPeers({ limit = 16, timeoutMs = 5_000 } = {}) {
    const cid = await transparencyReplicationCid(this.log.sourceOwnerId);
    const peers = [];
    const seen = new Set();
    for await (const provider of this.node.contentRouting.findProviders(cid, { signal: AbortSignal.timeout(timeoutMs) })) {
      const peerId = provider.id.toString();
      if (peerId === this.node.peerId.toString() || seen.has(peerId)) continue;
      seen.add(peerId);
      peers.push(provider.id);
      if (peers.length >= limit) break;
    }
    return peers;
  }

  async syncNetwork({ limit = 16, timeoutMs = 5_000 } = {}) {
    const peers = await this.discoverReplicaPeers({ limit, timeoutMs });
    const results = [];
    for (const peerId of peers) {
      try { results.push({ ok: true, ...(await this.syncWithPeer(peerId, { timeoutMs })) }); }
      catch (error) { results.push({ ok: false, peerId: peerId.toString(), error: error.code || error.message }); }
    }
    return { peers: peers.length, successful: results.filter((item) => item.ok).length, results, head: this.log.head() };
  }

  async recoverAndAdvertise({ limit = 16, timeoutMs = 5_000 } = {}) {
    if (!this.started) await this.start({ advertise: false });
    const recovered = await this.syncNetwork({ limit, timeoutMs });
    if (this.log.head().sequence === 0 || recovered.successful === 0) {
      const error = new Error('transparency_recovery_source_not_found');
      error.code = 'transparency_recovery_source_not_found';
      throw error;
    }
    if (!this.advertisingEnabled) await this.advertise();
    return { ...recovered, head: this.log.head() };
  }

  async replicate({ minAcks = 1, limit = 16, timeoutMs = 5_000 } = {}) {
    await this.advertise();
    const result = await this.syncNetwork({ limit, timeoutMs });
    if (result.successful < minAcks) {
      const error = new Error('transparency_replication_quorum_not_met');
      error.code = 'transparency_replication_quorum_not_met';
      error.acks = result.successful;
      error.required = minAcks;
      throw error;
    }
    return { ...result, requiredAcks: minAcks };
  }
}
