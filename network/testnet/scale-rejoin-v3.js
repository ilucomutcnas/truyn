import { connectQuicPeers } from '../transport/quic-kademlia.js';
import { AdversarialScaleNode } from './scale-node.js';

const originalStart = AdversarialScaleNode.prototype.start;
const originalStop = AdversarialScaleNode.prototype.stop;
const liveNodes = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function survivorNeighbors(node, count = 6) {
  const survivors = [...liveNodes.values()]
    .filter((candidate) => candidate !== node && candidate.node?.status === 'started' && candidate.__truynScaleLifecycleGenerationV3 === 1)
    .sort((left, right) => left.index - right.index);
  if (survivors.length === 0) return [];

  const offsets = [0, 1, 3, 7, 17, 31];
  const selected = [];
  const seen = new Set();
  for (const offset of offsets) {
    const candidate = survivors[(node.index + offset) % survivors.length];
    if (!candidate || seen.has(candidate.index)) continue;
    seen.add(candidate.index);
    selected.push(candidate);
    if (selected.length >= Math.min(count, survivors.length)) break;
  }
  return selected;
}

async function forgetOldPeer(oldPeerId) {
  if (!oldPeerId) return;
  await Promise.all([...liveNodes.values()].map(async (node) => {
    if (node.node?.status !== 'started') return;
    await node.purgeRoutingPeers([oldPeerId]).catch(() => null);
    try {
      if (typeof node.node.peerStore?.delete === 'function') await node.node.peerStore.delete(oldPeerId);
    } catch {
      // The peer may already have been evicted by the disconnect handler.
    }
  }));
}

async function rejoinRotatedPeer(node) {
  const neighbors = survivorNeighbors(node, 6);
  const ownAddress = node.address;
  if (!ownAddress || neighbors.length === 0) return;

  // A rotated transport identity is a new Kademlia participant. Rejoin it through
  // several stable survivors over real QUIC in both directions so the new PeerId
  // and its dialable address are learned by multiple routing-table owners. This is
  // topology repair, not a shortcut for measurement: independent requesters still
  // have to discover the new PeerId through peerRouting.findPeer afterwards.
  for (const neighbor of neighbors) {
    const neighborAddress = neighbor.address;
    if (!neighborAddress) continue;
    await connectQuicPeers(node.node, [neighborAddress]).catch(() => null);
    await connectQuicPeers(neighbor.node, [ownAddress]).catch(() => null);
  }

  await sleep(100);
  await Promise.all([
    node.refresh({ timeoutMs: 5_000, externalAbort: true }).catch(() => null),
    ...neighbors.slice(0, 3).map((neighbor) => neighbor.refresh({ timeoutMs: 5_000, externalAbort: true }).catch(() => null))
  ]);
  await sleep(100);
}

if (!AdversarialScaleNode.prototype.__truynScaleRejoinV3) {
  Object.defineProperty(AdversarialScaleNode.prototype, '__truynScaleRejoinV3', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  AdversarialScaleNode.prototype.start = async function startWithRotatedPeerRejoin(options = {}) {
    if (this.node?.status === 'started') return originalStart.call(this, options);
    const restarting = this.__truynScaleLifecycleEverStartedV3 === true;
    const generation = Number(this.__truynScaleLifecycleGenerationV3 || 0) + 1;
    const result = await originalStart.call(this, options);
    this.__truynScaleLifecycleEverStartedV3 = true;
    this.__truynScaleLifecycleGenerationV3 = generation;
    liveNodes.set(this.index, this);
    if (restarting) await rejoinRotatedPeer(this);
    return result;
  };

  AdversarialScaleNode.prototype.stop = async function stopWithPeerEviction() {
    const oldPeerId = this.peerId;
    const result = await originalStop.call(this);
    liveNodes.delete(this.index);
    await forgetOldPeer(oldPeerId);
    return result;
  };
}
