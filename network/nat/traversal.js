import { randomBytes } from 'node:crypto';
import { punchQuicSocket } from './hole-punch.js';

export const NAT_REACHABILITY_PUNCH = 'punch';

function normalizeMapped(mapped) {
  if (!mapped?.address || typeof mapped.address !== 'string') return null;
  const port = Number(mapped.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { address: mapped.address, port };
}

export function peerNatMappedEndpoint(peerRecord) {
  const mapped = normalizeMapped(peerRecord?.nat?.mapped);
  if (!mapped) return null;
  return {
    host: mapped.address,
    port: mapped.port,
    value: `quic://${mapped.address.includes(':') ? `[${mapped.address}]` : mapped.address}:${mapped.port}`
  };
}

export class CoordinatedNatTraversal {
  constructor({ quicTransport, localMapped, coordinate, attempts = 12, intervalMs = 75 } = {}) {
    if (!quicTransport?.socket?.send || !quicTransport?.identity?.nodeId) throw new Error('started QUIC transport is required');
    if (typeof coordinate !== 'function') throw new Error('NAT traversal coordination callback is required');
    const normalized = normalizeMapped(localMapped);
    if (!normalized) throw new Error('local mapped endpoint is required');
    this.quic = quicTransport;
    this.localMapped = normalized;
    this.coordinate = coordinate;
    this.attempts = attempts;
    this.intervalMs = intervalMs;
  }

  eligible(peerRecord) {
    return peerRecord?.nat?.reachability === NAT_REACHABILITY_PUNCH && Boolean(peerNatMappedEndpoint(peerRecord));
  }

  async prepare(peerRecord, { signal = null } = {}) {
    if (!this.eligible(peerRecord)) return null;
    const mapped = peerNatMappedEndpoint(peerRecord);
    const token = randomBytes(16).toString('base64url');
    const coordination = await this.coordinate(peerRecord.nodeId, {
      protocol: 'truyn-nat-coordinate-v1',
      token,
      requesterNodeId: this.quic.identity.nodeId,
      requesterMapped: this.localMapped,
      peerMapped: { address: mapped.host, port: mapped.port }
    });
    if (coordination?.accepted !== true) {
      const error = new Error('nat_traversal_coordination_rejected');
      error.code = 'TRUYN_NAT_COORDINATION_REJECTED';
      throw error;
    }
    const punch = await punchQuicSocket({
      quicTransport: this.quic,
      peerNodeId: peerRecord.nodeId,
      localMapped: this.localMapped,
      peerMapped: { address: mapped.host, port: mapped.port },
      attempts: this.attempts,
      intervalMs: this.intervalMs,
      token,
      signal
    });
    return { endpoint: { host: mapped.host, port: mapped.port }, endpointValue: mapped.value, punch, coordinated: true };
  }
}
