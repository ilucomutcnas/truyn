import { verifyDhtRecord } from '../dht/kademlia.js';

function uniquePeers(peers = []) {
  const seen = new Set();
  return peers.filter((peer) => peer?.nodeId && !seen.has(peer.nodeId) && seen.add(peer.nodeId));
}

export class DhtReplicationManager {
  constructor({ discovery, rpc, recordStore, replicationFactor = 3, writeQuorum = 2 } = {}) {
    if (!discovery || !rpc || !recordStore) throw new Error('DHT replication requires discovery, rpc and recordStore');
    if (!Number.isInteger(replicationFactor) || replicationFactor < 1) throw new Error('replicationFactor must be >= 1');
    if (!Number.isInteger(writeQuorum) || writeQuorum < 1 || writeQuorum > replicationFactor) throw new Error('writeQuorum must be within replicationFactor');
    this.discovery = discovery;
    this.rpc = rpc;
    this.recordStore = recordStore;
    this.replicationFactor = replicationFactor;
    this.writeQuorum = writeQuorum;
  }

  candidates(namespace, key, count = this.replicationFactor + 4) {
    return uniquePeers(this.discovery.closest(`dht:${namespace}:${key}`, Math.max(count, this.replicationFactor)));
  }

  async put(record, { replicationFactor = this.replicationFactor, minAcks = this.writeQuorum } = {}) {
    const verification = verifyDhtRecord(record);
    if (!verification.ok) throw new Error(`invalid DHT record: ${verification.reason}`);
    if (!Number.isInteger(replicationFactor) || replicationFactor < 1) throw new Error('replicationFactor must be >= 1');
    if (!Number.isInteger(minAcks) || minAcks < 1 || minAcks > replicationFactor) throw new Error('minAcks must be within replicationFactor');

    const local = this.recordStore.put(record);
    let acknowledgements = local.accepted ? 1 : 0;
    const storedAt = local.accepted ? [this.discovery.identity.nodeId] : [];
    const failures = [];
    const remoteNeeded = Math.max(0, replicationFactor - acknowledgements);

    for (const peer of this.candidates(record.namespace, record.key, replicationFactor + 8)) {
      if (storedAt.length >= replicationFactor) break;
      try {
        const result = await this.rpc.store(peer, record);
        if (result?.stored) {
          acknowledgements += 1;
          storedAt.push(peer.nodeId);
        }
      } catch (error) {
        this.rpc.forget?.(peer.nodeId);
        failures.push({ nodeId: peer.nodeId, reason: error?.message || 'dht_store_failed' });
      }
    }

    if (acknowledgements < minAcks) {
      const error = new Error(`TRUYN_DHT_WRITE_QUORUM:${acknowledgements}/${minAcks}`);
      error.code = 'TRUYN_DHT_WRITE_QUORUM';
      error.acknowledgements = acknowledgements;
      error.required = minAcks;
      error.failures = failures;
      throw error;
    }

    return { stored: true, recordId: record.recordId, acknowledgements, replicationFactor, remoteNeeded, storedAt, failures };
  }

  async get(namespace, key, { fanout = this.replicationFactor + 4 } = {}) {
    const byId = new Map(this.recordStore.get(namespace, key).map((record) => [record.recordId, record]));
    const failures = [];
    for (const peer of this.candidates(namespace, key, fanout)) {
      try {
        const response = await this.rpc.findValue(peer, namespace, key);
        for (const record of response?.records || []) {
          if (!verifyDhtRecord(record).ok) continue;
          byId.set(record.recordId, record);
          this.recordStore.put(record);
        }
      } catch (error) {
        this.rpc.forget?.(peer.nodeId);
        failures.push({ nodeId: peer.nodeId, reason: error?.message || 'dht_find_value_failed' });
      }
    }
    const records = [...byId.values()].sort((a, b) => b.sequence - a.sequence || a.publisherNodeId.localeCompare(b.publisherNodeId));
    return { records, failures };
  }

  async repair(namespace, key, { replicationFactor = this.replicationFactor, minAcks = this.writeQuorum } = {}) {
    const resolved = await this.get(namespace, key, { fanout: replicationFactor + 8 });
    const repairs = [];
    for (const record of resolved.records) {
      repairs.push(await this.put(record, { replicationFactor, minAcks }));
    }
    return { records: resolved.records.length, repairs, readFailures: resolved.failures };
  }
}
