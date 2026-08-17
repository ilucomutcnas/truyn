import { createIdentity } from '../../core/identity/index.js';
import { TruynNetworkNode } from '../runtime.js';

export const TESTNET_OPERATOR_PREFIX = 'testnet.operator.';

export class TestnetNetworkOperator {
  constructor({ identity = createIdentity(), tls, dhtRpcTimeoutMs = 5_000 } = {}) {
    if (!tls?.key || !tls?.cert) throw new Error('testnet operator TLS key/certificate are required');
    this.identity = identity;
    this.node = new TruynNetworkNode({
      identity,
      host: '0.0.0.0',
      port: 0,
      advertiseHost: '127.0.0.1',
      tls,
      capabilities: ['testnet.operator'],
      dhtRpcTimeoutMs
    });
  }

  async start(peerRecords = []) {
    await this.node.start();
    this.node.bootstrap(peerRecords);
    return this;
  }

  bootstrap(peerRecords = []) {
    return this.node.bootstrap(peerRecords);
  }

  async command(nodeId, command, input = {}, options = {}) {
    if (typeof command !== 'string' || !/^[a-z][a-z0-9-]*$/.test(command)) throw new Error('invalid testnet operator command');
    const result = await this.node.need(
      nodeId,
      `${TESTNET_OPERATOR_PREFIX}${command}`,
      input,
      {},
      { allowRelayFallback: false, ...options }
    );
    return result?.result ?? result;
  }

  async status(nodeId) { return this.command(nodeId, 'status'); }
  async bootstrapRemote(nodeId, records) { return this.command(nodeId, 'bootstrap', { records }); }
  async directNeed(nodeId, targetNodeId, input) { return this.command(nodeId, 'need', { nodeId: targetNodeId, input }); }
  async replicate(nodeId, input) { return this.command(nodeId, 'replicate', input); }
  async find(nodeId, input) { return this.command(nodeId, 'find', input); }
  async repair(nodeId, input) { return this.command(nodeId, 'repair', input); }
  async sweep(nodeId) { return this.command(nodeId, 'sweep'); }

  async close() { await this.node.close(); }
}
