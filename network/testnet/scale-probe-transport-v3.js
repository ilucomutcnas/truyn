import { AdversarialScaleNode } from './scale-node.js';

const originalFindPeer = AdversarialScaleNode.prototype.findPeer;
const originalProbe = AdversarialScaleNode.prototype.probe;

function peerIdFromTarget(target) {
  const text = target?.toString?.() || String(target || '');
  const match = text.match(/\/p2p\/([^/]+)$/);
  if (match) return match[1];
  return text.startsWith('/') ? null : text || null;
}

function isTransportFailure(result) {
  return Boolean(result && !result.ok && result.transportError);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!AdversarialScaleNode.prototype.__truynScaleProbeTransportV3) {
  Object.defineProperty(AdversarialScaleNode.prototype, '__truynScaleProbeTransportV3', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  AdversarialScaleNode.prototype.findPeer = async function findPeerWithRoutableCache(targetPeerId, options = {}) {
    const peerInfo = await originalFindPeer.call(this, targetPeerId, options);
    if (!peerInfo?.id) return peerInfo;

    const peerId = peerInfo.id.toString();
    const multiaddrs = Array.from(peerInfo.multiaddrs || []);
    this.__truynScaleRoutablePeerInfoV3 ||= new Map();

    if (multiaddrs.length > 0) {
      this.__truynScaleRoutablePeerInfoV3.set(peerId, multiaddrs);
      return peerInfo;
    }

    // js-libp2p can satisfy a follow-up findPeer from local routing/peer state with
    // the correct PeerId but no dialable addresses. If this same requester already
    // learned addresses for this exact PeerId from an earlier successful Kad
    // lookup, retain those addresses for the immediately following signed probe.
    // The cache is keyed by transport PeerId, so a restarted node's old addresses
    // cannot be reused after its PeerId rotation.
    const cached = this.__truynScaleRoutablePeerInfoV3.get(peerId);
    if (cached?.length > 0) {
      await this.node.peerStore.merge(peerInfo.id, { multiaddrs: cached }).catch(() => null);
      return { ...peerInfo, multiaddrs: cached };
    }

    return peerInfo;
  };

  AdversarialScaleNode.prototype.probe = async function probeWithResolvedTransport(target, value, options = {}) {
    const expectedPeerId = peerIdFromTarget(target);
    const timeoutMs = Math.max(8_000, Number(options.timeoutMs || 3_000));
    const transportRetries = Math.max(1, Number(options.transportRetries ?? 1));
    let resolved = null;

    if (expectedPeerId && !String(target?.toString?.() || target).startsWith('/')) {
      resolved = await this.findPeer(target, { timeoutMs: Math.min(5_000, timeoutMs) }).catch(() => null);
    }

    let dialTarget = resolved?.multiaddrs?.[0] || target;
    if (resolved?.multiaddrs?.length > 0) {
      await this.node.peerStore.merge(resolved.id, { multiaddrs: resolved.multiaddrs }).catch(() => null);
      await this.node.dial(dialTarget, { signal: AbortSignal.timeout(Math.min(5_000, timeoutMs)) }).catch(() => null);
    }

    let result = await originalProbe.call(this, resolved?.id || dialTarget, value, {
      ...options,
      timeoutMs,
      transportRetries
    });

    // A transport failure may mean that a freshly rotated PeerId/address has not
    // converged into this requester's PeerStore yet, or that a connection under
    // adversarial stream pressure has been reset. Replace only the target
    // connection, repair routing once, then retry. Attacker connections remain
    // established, so this does not weaken Byzantine/Sybil pressure.
    // Cryptographically invalid/malicious replies never enter this branch because
    // they do not carry transportError and therefore are never retried-to-success.
    if (isTransportFailure(result) && expectedPeerId) {
      const peerIdObject = resolved?.id || (!String(target?.toString?.() || target).startsWith('/') ? target : null);
      if (peerIdObject) {
        await this.node.hangUp(peerIdObject).catch(() => null);
        await sleep(40);
        const refreshed = await this.findPeer(peerIdObject, { timeoutMs: Math.min(6_000, timeoutMs) }).catch(() => null);
        if (refreshed?.multiaddrs?.length > 0) {
          await this.node.peerStore.merge(refreshed.id, { multiaddrs: refreshed.multiaddrs }).catch(() => null);
          dialTarget = refreshed.multiaddrs[0];
          await this.node.dial(dialTarget, { signal: AbortSignal.timeout(Math.min(5_000, timeoutMs)) }).catch(() => null);
          result = await originalProbe.call(this, refreshed.id, value, {
            ...options,
            timeoutMs,
            transportRetries: 1
          });
        }
      }
    }

    const responderPeerId = result?.response?.body?.responderPeerId || null;
    const targetPeerBound = expectedPeerId == null || responderPeerId == null
      ? expectedPeerId == null
      : responderPeerId === expectedPeerId;

    if (result?.ok && expectedPeerId && !targetPeerBound) {
      return {
        ...result,
        ok: false,
        targetPeerBound: false,
        expectedPeerId,
        responderPeerId,
        integrityError: 'truyn_scale_probe_peer_binding_mismatch'
      };
    }

    return {
      ...result,
      targetPeerBound,
      expectedPeerId,
      responderPeerId
    };
  };
}
