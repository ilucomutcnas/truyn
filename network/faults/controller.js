function faultError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function normalizeNodeIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

export class NetworkFaultController {
  constructor({ sleepFn = sleep } = {}) {
    this.partitionedPeers = new Set();
    this.relayMode = 'up';
    this.relayDelayMs = 0;
    this.sleepFn = sleepFn;
  }

  snapshot() {
    return {
      partitionedPeers: [...this.partitionedPeers].sort(),
      relay: { mode: this.relayMode, delayMs: this.relayDelayMs }
    };
  }

  partition(nodeIds) {
    const normalized = normalizeNodeIds(nodeIds);
    if (normalized.length === 0) throw new Error('at least one peer nodeId is required');
    for (const nodeId of normalized) this.partitionedPeers.add(nodeId);
    return this.snapshot();
  }

  heal(nodeIds = null) {
    if (nodeIds == null) {
      this.partitionedPeers.clear();
      return this.snapshot();
    }
    for (const nodeId of normalizeNodeIds(nodeIds)) this.partitionedPeers.delete(nodeId);
    return this.snapshot();
  }

  isPartitioned(nodeId) {
    return this.partitionedPeers.has(nodeId);
  }

  assertPeer(nodeId, operation = 'network') {
    if (!this.isPartitioned(nodeId)) return true;
    throw faultError(
      'TRUYN_NETWORK_PARTITION',
      `TRUYN_NETWORK_PARTITION:${nodeId}:${operation}`,
      { peerNodeId: nodeId, operation }
    );
  }

  setRelay({ mode = 'up', delayMs = 0 } = {}) {
    if (!['up', 'down', 'degraded'].includes(mode)) throw new Error('relay mode must be up, down or degraded');
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 120_000) throw new Error('relay delayMs must be between 0 and 120000');
    this.relayMode = mode;
    this.relayDelayMs = mode === 'degraded' ? delayMs : 0;
    return this.snapshot();
  }

  async beforeRelay(peerNodeId = null) {
    if (this.relayMode === 'down') {
      throw faultError('TRUYN_RELAY_UNAVAILABLE', 'TRUYN_RELAY_UNAVAILABLE', { peerNodeId });
    }
    if (this.relayMode === 'degraded' && this.relayDelayMs > 0) await this.sleepFn(this.relayDelayMs);
    return true;
  }
}
