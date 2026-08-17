import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { DurableAcceptedWorkInbox } from './admission/durable-inbox.js';
import { KademliaRecordStore, createDhtRecord } from './dht/kademlia.js';
import { PeerDiscovery, createPeerRecord, verifyPeerRecord } from './discovery/peer-discovery.js';
import { QuicDiscoveryRpc, createQuicDiscoveryControlHandler } from './discovery/quic-rpc.js';
import { NetworkFaultController } from './faults/controller.js';
import { DhtReplicationManager } from './replication/dht-replication.js';
import { DurableNetworkState } from './state/persistent-state.js';
import { TruynQuicTransport } from './transport/quic.js';
import { DirectFirstP2P } from './transport/p2p.js';

export class TruynNetworkNode {
  constructor({
    identity = createIdentity(), host = '0.0.0.0', port = 0, advertiseHost = null, tls,
    k = 20, alpha = 3, relayFallback = null, nat = null, capabilities = [], peerRecordTtlMs = 300_000,
    maxInFlight = 64, maxQueued = 256, statePath = null, dhtReplicationFactor = 3, dhtWriteQuorum = 2,
    dhtRpcTimeoutMs = 5_000, faultController = null, workInboxPath = null, workInboxMaxCompleted = 10_000,
    peerRecordAutoRenew = true, peerRecordRenewBeforeMs = null, peerRecordPublishFanout = null
  } = {}) {
    if (!tls?.key || !tls?.cert) throw new Error('network runtime TLS key/certificate are required');
    if (!Number.isFinite(peerRecordTtlMs) || peerRecordTtlMs <= 0) throw new Error('peerRecordTtlMs must be positive');
    const renewBeforeMs = peerRecordRenewBeforeMs == null
      ? Math.min(60_000, Math.max(50, Math.floor(peerRecordTtlMs / 5)))
      : peerRecordRenewBeforeMs;
    if (peerRecordAutoRenew && (!Number.isFinite(renewBeforeMs) || renewBeforeMs <= 0 || renewBeforeMs >= peerRecordTtlMs)) {
      throw new Error('peerRecordRenewBeforeMs must be positive and less than peerRecordTtlMs');
    }
    const publishFanout = peerRecordPublishFanout == null ? k : peerRecordPublishFanout;
    if (!Number.isInteger(publishFanout) || publishFanout < 0) throw new Error('peerRecordPublishFanout must be a non-negative integer');

    this.identity = identity;
    this.host = host;
    this.port = port;
    this.advertiseHost = advertiseHost;
    this.tls = tls;
    this.k = k;
    this.alpha = alpha;
    this.relayFallback = relayFallback;
    this.nat = nat;
    this.capabilities = [...new Set(capabilities)];
    this.peerRecordTtlMs = peerRecordTtlMs;
    this.peerRecordAutoRenew = Boolean(peerRecordAutoRenew);
    this.peerRecordRenewBeforeMs = renewBeforeMs;
    this.peerRecordPublishFanout = publishFanout;
    this.peerRecordRenewTimer = null;
    this.peerRecordRenewalInFlight = null;
    this.peerRecordLifecycle = {
      autoRenew: this.peerRecordAutoRenew,
      ttlMs: this.peerRecordTtlMs,
      renewBeforeMs: this.peerRecordRenewBeforeMs,
      publishFanout: this.peerRecordPublishFanout,
      durableSequence: Boolean(statePath),
      lastRenewedAt: null,
      lastSequence: null,
      lastAnnouncementAt: null,
      lastAnnouncement: null,
      lastError: null
    };
    this.sequence = 0;
    this.started = false;
    this.closing = false;
    this.localPeerRecord = null;
    this.envelopeHandler = null;
    this.stateStore = statePath ? new DurableNetworkState({ filePath: statePath }) : null;
    this.workInbox = workInboxPath ? new DurableAcceptedWorkInbox({ filePath: workInboxPath, maxCompleted: workInboxMaxCompleted }) : null;
    this.stateReady = false;
    this.persistQueue = Promise.resolve();
    this.faults = faultController || new NetworkFaultController();
    const onStateChange = () => this.schedulePersist();
    const onRecordAccepted = ({ nodeId, previous, record }) => {
      if (!previous || previous.recordId === record.recordId) return;
      this.rpc?.forget?.(nodeId);
      const forgotten = this.router?.forget?.(nodeId);
      if (forgotten?.catch) void forgotten.catch(() => {});
    };
    this.recordStore = new KademliaRecordStore({ onChange: onStateChange });
    this.quic = new TruynQuicTransport({ identity, host, port, tls });
    this.discovery = new PeerDiscovery({ identity, k, alpha, onChange: onStateChange, onRecordAccepted });
    this.rpc = new QuicDiscoveryRpc({
      quicTransport: this.quic,
      timeoutMs: dhtRpcTimeoutMs,
      faults: this.faults,
      ingestPeerRecord: (record) => this.discovery.ingest(record)
    });
    this.discovery.rpc = this.rpc;
    this.replication = new DhtReplicationManager({
      discovery: this.discovery,
      rpc: this.rpc,
      recordStore: this.recordStore,
      replicationFactor: dhtReplicationFactor,
      writeQuorum: dhtWriteQuorum
    });
    this.router = new DirectFirstP2P({
      quicTransport: this.quic,
      discovery: this.discovery,
      relayFallback,
      maxInFlight,
      maxQueued,
      faults: this.faults
    });
    this.quic.onControl(createQuicDiscoveryControlHandler(this.discovery, {
      recordStore: this.recordStore,
      localPeerRecord: () => this.localPeerRecord
    }));
  }

  snapshotState() {
    return {
      nodeId: this.identity.nodeId,
      sequence: this.sequence,
      savedAt: new Date().toISOString(),
      peerRecords: this.discovery.snapshot(),
      dhtRecords: this.recordStore.snapshot()
    };
  }

  schedulePersist() {
    if (!this.stateStore || !this.stateReady) return;
    const snapshot = this.snapshotState();
    this.persistQueue = this.persistQueue.then(() => this.stateStore.save(snapshot));
  }

  async persistState() {
    if (!this.stateStore) return null;
    const snapshot = this.snapshotState();
    this.persistQueue = this.persistQueue.then(() => this.stateStore.save(snapshot));
    await this.persistQueue;
    return snapshot;
  }

  async hydrateState() {
    if (!this.stateStore) { this.stateReady = true; return null; }
    const state = await this.stateStore.load();
    if (state) {
      if (state.nodeId !== this.identity.nodeId) throw new Error('network_state_identity_mismatch');
      this.sequence = Math.max(this.sequence, Number.isInteger(state.sequence) ? state.sequence : 0);
      this.discovery.restore(state.peerRecords || [], { notify: false });
      this.recordStore.restore(state.dhtRecords || [], { notify: false });
    }
    this.stateReady = true;
    return state;
  }

  async #dispatchEnvelope(envelope, context) {
    if (!this.envelopeHandler) {
      const error = new Error('no_envelope_handler');
      error.code = 'TRUYN_NO_ENVELOPE_HANDLER';
      throw error;
    }
    if (!this.workInbox) return this.envelopeHandler(envelope, context);
    return this.workInbox.run(envelope, context, this.envelopeHandler);
  }

  #clearPeerRecordRenewTimer() {
    if (!this.peerRecordRenewTimer) return;
    clearTimeout(this.peerRecordRenewTimer);
    this.peerRecordRenewTimer = null;
  }

  #schedulePeerRecordRenewal() {
    this.#clearPeerRecordRenewTimer();
    if (!this.started || this.closing || !this.peerRecordAutoRenew || !this.localPeerRecord) return;
    const expiresAt = Date.parse(this.localPeerRecord.expiresAt);
    const minimumDelay = Math.min(1_000, Math.max(25, Math.floor(this.peerRecordTtlMs / 20)));
    const delayMs = Math.max(minimumDelay, expiresAt - Date.now() - this.peerRecordRenewBeforeMs);
    this.peerRecordRenewTimer = setTimeout(() => {
      this.peerRecordRenewTimer = null;
      void this.renewPeerRecord().catch((error) => {
        this.peerRecordLifecycle.lastError = {
          at: new Date().toISOString(),
          code: error?.code || null,
          message: error?.message || String(error)
        };
      });
    }, delayMs);
    this.peerRecordRenewTimer.unref?.();
  }

  onEnvelope(handler) {
    this.envelopeHandler = typeof handler === 'function' ? handler : null;
    this.quic.onEnvelope(this.envelopeHandler ? (envelope, context) => this.#dispatchEnvelope(envelope, context) : null);
    return this;
  }

  async recoverAcceptedWork() {
    if (!this.workInbox || !this.envelopeHandler) return [];
    return this.workInbox.recover(this.envelopeHandler);
  }

  acceptedWorkSnapshot() {
    return this.workInbox?.snapshot() || null;
  }

  peerRecordLifecycleSnapshot() {
    return structuredClone(this.peerRecordLifecycle);
  }

  envelope(type, payload, { to = null, id, time, trace, deadline, priority } = {}) {
    return createEnvelope({ type, from: this.identity.nodeId, to, payload, id, time, trace, deadline, priority,
      privateKeyPem: this.identity.privateKeyPem, publicKeyPem: this.identity.publicKeyPem });
  }

  async start() {
    if (this.started) return this.localPeerRecord;
    this.closing = false;
    await this.hydrateState();
    await this.workInbox?.load();
    const endpoint = await this.quic.start();
    const advertisedHost = this.advertiseHost || (endpoint.host === '0.0.0.0' ? '127.0.0.1' : endpoint.host);
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({ identity: this.identity, endpoints: [`quic://${advertisedHost}:${endpoint.port}`],
      sequence: this.sequence, ttlMs: this.peerRecordTtlMs, capabilities: this.capabilities, nat: this.nat });
    this.started = true;
    await this.persistState();
    await this.recoverAcceptedWork();
    this.peerRecordLifecycle.lastSequence = this.localPeerRecord.sequence;
    this.#schedulePeerRecordRenewal();
    return structuredClone(this.localPeerRecord);
  }

  refreshPeerRecord({ nat = this.nat, capabilities = this.capabilities, persist = true } = {}) {
    if (!this.started) throw new Error('network node is not started');
    this.nat = nat;
    this.capabilities = [...new Set(capabilities)];
    const endpoint = this.localPeerRecord.endpoints[0];
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({ identity: this.identity, endpoints: [endpoint], sequence: this.sequence,
      ttlMs: this.peerRecordTtlMs, capabilities: this.capabilities, nat: this.nat });
    if (persist) this.schedulePersist();
    return structuredClone(this.localPeerRecord);
  }

  async announcePeerRecord(record = this.localPeerRecord, { fanout = this.peerRecordPublishFanout, peers = null } = {}) {
    if (!this.started) throw new Error('network node is not started');
    const verification = verifyPeerRecord(record);
    if (!verification.ok || record.nodeId !== this.identity.nodeId) throw new Error(`invalid_local_peer_record:${verification.reason || 'identity_mismatch'}`);
    const candidates = (Array.isArray(peers) ? peers : this.discovery.snapshot())
      .filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId)
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId))
      .slice(0, fanout);
    const settled = await Promise.allSettled(candidates.map((peer) => this.rpc.announce(peer, record)));
    const failedNodeIds = [];
    let delivered = 0;
    for (let i = 0; i < settled.length; i += 1) {
      if (settled[i].status === 'fulfilled') delivered += 1;
      else failedNodeIds.push(candidates[i].nodeId);
    }
    const result = {
      sequence: record.sequence,
      attempted: candidates.length,
      delivered,
      failed: failedNodeIds.length,
      failedNodeIds
    };
    this.peerRecordLifecycle.lastAnnouncementAt = new Date().toISOString();
    this.peerRecordLifecycle.lastAnnouncement = result;
    return structuredClone(result);
  }

  async renewPeerRecord({ nat = this.nat, capabilities = this.capabilities, announce = true } = {}) {
    if (!this.started || this.closing) throw new Error('network node is not available for peer-record renewal');
    if (this.peerRecordRenewalInFlight) return this.peerRecordRenewalInFlight;
    const operation = (async () => {
      const previous = this.localPeerRecord;
      const record = this.refreshPeerRecord({ nat, capabilities, persist: false });

      // Durability precedes dissemination. Otherwise a crash after publish could restart from
      // the old persisted sequence and mint a different record with the already-seen sequence.
      await this.persistState();

      const announcement = announce
        ? await this.announcePeerRecord(record)
        : { sequence: record.sequence, attempted: 0, delivered: 0, failed: 0, failedNodeIds: [] };
      this.peerRecordLifecycle.lastRenewedAt = new Date().toISOString();
      this.peerRecordLifecycle.lastSequence = record.sequence;
      this.peerRecordLifecycle.lastError = null;
      return { previousSequence: previous?.sequence || null, record, announcement };
    })();
    this.peerRecordRenewalInFlight = operation;
    try {
      return await operation;
    } catch (error) {
      this.peerRecordLifecycle.lastError = {
        at: new Date().toISOString(),
        code: error?.code || null,
        message: error?.message || String(error)
      };
      throw error;
    } finally {
      if (this.peerRecordRenewalInFlight === operation) this.peerRecordRenewalInFlight = null;
      this.#schedulePeerRecordRenewal();
    }
  }

  bootstrap(records = []) {
    const results = [];
    for (const record of records) {
      const verification = verifyPeerRecord(record);
      if (!verification.ok) { results.push({ accepted: false, reason: verification.reason }); continue; }
      results.push(this.discovery.ingest(record));
    }
    return results;
  }

  async findPeer(nodeId) { return this.discovery.get(nodeId) || this.discovery.findNode(nodeId); }
  async pingPeer(nodeId) { const peer = await this.findPeer(nodeId); return peer ? this.rpc.ping(peer) : false; }
  async send(nodeId, envelope, options = {}) { if (!this.started) throw new Error('network node is not started'); return this.router.send(nodeId, envelope, options); }

  async need(nodeId, capability, input, policy = {}, options = {}) {
    return this.send(nodeId, this.envelope('NEED', { capability: { name: capability }, input, policy }, { to: nodeId }), options);
  }

  createRecord(namespace, key, value, options = {}) { return createDhtRecord({ identity: this.identity, namespace, key, value, ...options }); }
  async storeAt(nodeId, record) { const peer = await this.findPeer(nodeId); if (!peer) throw new Error('DHT peer not found'); return this.rpc.store(peer, record); }
  async findValueAt(nodeId, namespace, key) { const peer = await this.findPeer(nodeId); if (!peer) throw new Error('DHT peer not found'); return this.rpc.findValue(peer, namespace, key); }
  async replicateRecord(record, options = {}) { return this.replication.put(record, options); }
  async findReplicatedValue(namespace, key, options = {}) { return this.replication.get(namespace, key, options); }
  async repairRecord(namespace, key, options = {}) { return this.replication.repair(namespace, key, options); }

  partitionPeers(nodeIds) {
    for (const nodeId of Array.isArray(nodeIds) ? nodeIds : [nodeIds]) {
      this.router.forget(nodeId);
      this.rpc.forget(nodeId);
    }
    return this.faults.partition(nodeIds);
  }

  healPeers(nodeIds = null) { return this.faults.heal(nodeIds); }
  setRelayFault(config = {}) { return this.faults.setRelay(config); }
  faultSnapshot() { return this.faults.snapshot(); }

  async close() {
    if (!this.started && !this.closing) return;
    this.closing = true;
    this.#clearPeerRecordRenewTimer();
    if (this.peerRecordRenewalInFlight) {
      try { await this.peerRecordRenewalInFlight; } catch { /* renewal failure must not prevent shutdown */ }
    }
    if (this.stateReady) await this.persistState();
    this.started = false;
    await this.quic.close();
  }
}
