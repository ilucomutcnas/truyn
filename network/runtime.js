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
    dhtRpcTimeoutMs = 5_000, faultController = null, workInboxPath = null, workInboxMaxCompleted = 10_000
  } = {}) {
    if (!tls?.key || !tls?.cert) throw new Error('network runtime TLS key/certificate are required');
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
    this.sequence = 0;
    this.started = false;
    this.localPeerRecord = null;
    this.envelopeHandler = null;
    this.stateStore = statePath ? new DurableNetworkState({ filePath: statePath }) : null;
    this.workInbox = workInboxPath ? new DurableAcceptedWorkInbox({ filePath: workInboxPath, maxCompleted: workInboxMaxCompleted }) : null;
    this.stateReady = false;
    this.persistQueue = Promise.resolve();
    this.faults = faultController || new NetworkFaultController();
    const onStateChange = () => this.schedulePersist();
    this.recordStore = new KademliaRecordStore({ onChange: onStateChange });
    this.quic = new TruynQuicTransport({ identity, host, port, tls });
    this.discovery = new PeerDiscovery({ identity, k, alpha, onChange: onStateChange });
    this.rpc = new QuicDiscoveryRpc({ quicTransport: this.quic, timeoutMs: dhtRpcTimeoutMs, faults: this.faults });
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
    this.quic.onControl(createQuicDiscoveryControlHandler(this.discovery, { recordStore: this.recordStore }));
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

  envelope(type, payload, { to = null, id, time, trace, deadline, priority } = {}) {
    return createEnvelope({ type, from: this.identity.nodeId, to, payload, id, time, trace, deadline, priority,
      privateKeyPem: this.identity.privateKeyPem, publicKeyPem: this.identity.publicKeyPem });
  }

  async start() {
    if (this.started) return this.localPeerRecord;
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
    return structuredClone(this.localPeerRecord);
  }

  refreshPeerRecord({ nat = this.nat, capabilities = this.capabilities } = {}) {
    if (!this.started) throw new Error('network node is not started');
    this.nat = nat;
    this.capabilities = [...new Set(capabilities)];
    const endpoint = this.localPeerRecord.endpoints[0];
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({ identity: this.identity, endpoints: [endpoint], sequence: this.sequence,
      ttlMs: this.peerRecordTtlMs, capabilities: this.capabilities, nat: this.nat });
    this.schedulePersist();
    return structuredClone(this.localPeerRecord);
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
    if (this.stateReady) await this.persistState();
    this.started = false;
    await this.quic.close();
  }
}
