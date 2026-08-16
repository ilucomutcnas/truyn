import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { KademliaRecordStore, createDhtRecord } from './dht/kademlia.js';
import { PeerDiscovery, createPeerRecord, verifyPeerRecord } from './discovery/peer-discovery.js';
import { QuicDiscoveryRpc, createQuicDiscoveryControlHandler } from './discovery/quic-rpc.js';
import { TruynQuicTransport } from './transport/quic.js';
import { DirectFirstP2P } from './transport/p2p.js';

export class TruynNetworkNode {
  constructor({
    identity = createIdentity(),
    host = '0.0.0.0',
    port = 0,
    advertiseHost = null,
    tls,
    k = 20,
    alpha = 3,
    relayFallback = null,
    nat = null,
    capabilities = [],
    peerRecordTtlMs = 300_000,
    maxInFlight = 64,
    maxQueued = 256
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
    this.recordStore = new KademliaRecordStore();
    this.quic = new TruynQuicTransport({ identity, host, port, tls });
    this.discovery = new PeerDiscovery({ identity, k, alpha });
    this.rpc = new QuicDiscoveryRpc({ quicTransport: this.quic });
    this.discovery.rpc = this.rpc;
    this.router = new DirectFirstP2P({
      quicTransport: this.quic,
      discovery: this.discovery,
      relayFallback,
      maxInFlight,
      maxQueued
    });
    this.quic.onControl(createQuicDiscoveryControlHandler(this.discovery, { recordStore: this.recordStore }));
  }

  onEnvelope(handler) {
    this.quic.onEnvelope(handler);
    return this;
  }

  envelope(type, payload, { to = null, id, time, trace, deadline, priority } = {}) {
    return createEnvelope({
      type,
      from: this.identity.nodeId,
      to,
      payload,
      id,
      time,
      trace,
      deadline,
      priority,
      privateKeyPem: this.identity.privateKeyPem,
      publicKeyPem: this.identity.publicKeyPem
    });
  }

  async start() {
    if (this.started) return this.localPeerRecord;
    const endpoint = await this.quic.start();
    const advertisedHost = this.advertiseHost || (endpoint.host === '0.0.0.0' ? '127.0.0.1' : endpoint.host);
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({
      identity: this.identity,
      endpoints: [`quic://${advertisedHost}:${endpoint.port}`],
      sequence: this.sequence,
      ttlMs: this.peerRecordTtlMs,
      capabilities: this.capabilities,
      nat: this.nat
    });
    this.started = true;
    return structuredClone(this.localPeerRecord);
  }

  refreshPeerRecord({ nat = this.nat, capabilities = this.capabilities } = {}) {
    if (!this.started) throw new Error('network node is not started');
    this.nat = nat;
    this.capabilities = [...new Set(capabilities)];
    const endpoint = this.localPeerRecord.endpoints[0];
    this.sequence += 1;
    this.localPeerRecord = createPeerRecord({
      identity: this.identity,
      endpoints: [endpoint],
      sequence: this.sequence,
      ttlMs: this.peerRecordTtlMs,
      capabilities: this.capabilities,
      nat: this.nat
    });
    return structuredClone(this.localPeerRecord);
  }

  bootstrap(records = []) {
    const results = [];
    for (const record of records) {
      const verification = verifyPeerRecord(record);
      if (!verification.ok) {
        results.push({ accepted: false, reason: verification.reason });
        continue;
      }
      results.push(this.discovery.ingest(record));
    }
    return results;
  }

  async findPeer(nodeId) {
    return this.discovery.get(nodeId) || this.discovery.findNode(nodeId);
  }

  async pingPeer(nodeId) {
    const peer = await this.findPeer(nodeId);
    if (!peer) return false;
    return this.rpc.ping(peer);
  }

  async send(nodeId, envelope, options = {}) {
    if (!this.started) throw new Error('network node is not started');
    return this.router.send(nodeId, envelope, options);
  }

  async need(nodeId, capability, input, policy = {}, options = {}) {
    const message = this.envelope('NEED', {
      capability: { name: capability },
      input,
      policy
    }, { to: nodeId });
    return this.send(nodeId, message, options);
  }

  createRecord(namespace, key, value, options = {}) {
    return createDhtRecord({ identity: this.identity, namespace, key, value, ...options });
  }

  async storeAt(nodeId, record) {
    const peer = await this.findPeer(nodeId);
    if (!peer) throw new Error('DHT peer not found');
    return this.rpc.store(peer, record);
  }

  async findValueAt(nodeId, namespace, key) {
    const peer = await this.findPeer(nodeId);
    if (!peer) throw new Error('DHT peer not found');
    return this.rpc.findValue(peer, namespace, key);
  }

  async close() {
    this.started = false;
    await this.quic.close();
  }
}
