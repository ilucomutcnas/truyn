function peerKey(peerId) {
  return typeof peerId === 'string' ? peerId : peerId?.toString?.() || '';
}

/**
 * Mutable libp2p connection gater used only by controlled TRUYN testnets.
 * A blocked peer is denied before dial and again after QUIC encryption in both
 * directions so a partition cannot be bypassed by the remote side redialling.
 */
export function createAdversarialConnectionGater() {
  const blockedPeers = new Set();

  const blocked = (peerId) => blockedPeers.has(peerKey(peerId));
  const connectionGater = {
    denyDialPeer: async (peerId) => blocked(peerId),
    denyInboundEncryptedConnection: async (peerId) => blocked(peerId),
    denyOutboundEncryptedConnection: async (peerId) => blocked(peerId),
    denyInboundUpgradedConnection: async (peerId) => blocked(peerId),
    denyOutboundUpgradedConnection: async (peerId) => blocked(peerId)
  };

  return {
    connectionGater,
    block(peerIds = []) {
      for (const peerId of peerIds) {
        const key = peerKey(peerId);
        if (key) blockedPeers.add(key);
      }
      return this.snapshot();
    },
    allow(peerIds = []) {
      for (const peerId of peerIds) blockedPeers.delete(peerKey(peerId));
      return this.snapshot();
    },
    heal() {
      blockedPeers.clear();
      return this.snapshot();
    },
    isBlocked(peerId) {
      return blocked(peerId);
    },
    snapshot() {
      return [...blockedPeers].sort();
    }
  };
}
