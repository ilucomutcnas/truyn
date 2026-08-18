export function buildClassD1000Placement({
  nodeCount = 1000,
  hostCount = 10,
  quicBasePort = 4400,
  controlBasePort = 8700
} = {}) {
  if (!Number.isInteger(nodeCount) || nodeCount < 1) throw new Error('nodeCount must be >= 1');
  if (!Number.isInteger(hostCount) || hostCount < 10) throw new Error('hostCount must be >= 10 for Class D-1000');
  if (nodeCount < hostCount) throw new Error('nodeCount must be >= hostCount');

  const base = Math.floor(nodeCount / hostCount);
  const remainder = nodeCount % hostCount;
  const hosts = [];
  let index = 0;
  for (let hostIndex = 0; hostIndex < hostCount; hostIndex += 1) {
    const count = base + (hostIndex < remainder ? 1 : 0);
    const nodes = [];
    for (let localIndex = 0; localIndex < count; localIndex += 1) {
      const quicPort = quicBasePort + localIndex;
      const controlPort = controlBasePort + localIndex;
      if (quicPort > 65535 || controlPort > 65535) throw new Error('port range exceeds 65535');
      nodes.push({
        nodeIndex: index,
        hostIndex,
        localIndex,
        quicPort,
        controlPort,
        identityPath: `node-${index}-identity.json`,
        statePath: `node-${index}-state.json`
      });
      index += 1;
    }
    hosts.push({ hostIndex, nodes });
  }

  return {
    nodeCount,
    hostCount,
    hosts,
    maxProcessesPerHost: Math.max(...hosts.map((host) => host.nodes.length)),
    minProcessesPerHost: Math.min(...hosts.map((host) => host.nodes.length))
  };
}

export function assertRealClassD1000Placement(placement) {
  const nodes = placement?.hosts?.flatMap((host) => host.nodes || []) || [];
  const identities = new Set(nodes.map((node) => node.identityPath));
  const states = new Set(nodes.map((node) => node.statePath));
  const sockets = new Set(nodes.map((node) => `${node.hostIndex}:${node.quicPort}`));
  return {
    passed: placement?.nodeCount === 1000 && placement?.hostCount >= 10 && nodes.length === 1000 && identities.size === 1000 && states.size === 1000 && sockets.size === 1000,
    nodeProcesses: nodes.length,
    hostFailureDomains: placement?.hostCount || 0,
    distinctIdentityPaths: identities.size,
    distinctStatePaths: states.size,
    distinctQuicSockets: sockets.size
  };
}
