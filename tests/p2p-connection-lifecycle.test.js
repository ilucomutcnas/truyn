import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectFirstP2P } from '../network/transport/p2p.js';

function record({ sequence, endpoint }) {
  return { nodeId: 'truyn:node:peer-b', sequence, endpoints: [endpoint] };
}

function harness(initialRecord) {
  let current = initialRecord;
  const connects = [];
  const disconnects = [];
  const quic = {
    async connect(endpoint) {
      const client = { endpoint, closed: false, serial: connects.length + 1 };
      connects.push(client);
      return client;
    },
    async disconnect(client) {
      client.closed = true;
      disconnects.push(client);
    },
    async sendEnvelope(client) {
      if (client.closed) throw new Error('quic_client_closed');
      return { serial: client.serial, endpoint: client.endpoint };
    }
  };
  const discovery = {
    get(nodeId) { return nodeId === current.nodeId ? current : null; },
    async findNode(nodeId) { return nodeId === current.nodeId ? current : null; }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, maxInFlight: 1, maxQueued: 1 });
  return {
    router,
    connects,
    disconnects,
    setRecord(next) { current = next; }
  };
}

test('newer signed peer record with a new endpoint invalidates the cached QUIC client', async () => {
  const h = harness(record({ sequence: 1, endpoint: 'quic://203.0.113.10:4433' }));

  const first = await h.router.send('truyn:node:peer-b', { id: 'one' }, { allowRelayFallback: false });
  assert.equal(first.transport, 'quic-direct');
  assert.deepEqual(first.result.endpoint, { host: '203.0.113.10', port: 4433 });
  assert.equal(h.connects.length, 1);

  h.setRecord(record({ sequence: 2, endpoint: 'quic://10.0.0.8:4433' }));
  const second = await h.router.send('truyn:node:peer-b', { id: 'two' }, { allowRelayFallback: false });

  assert.equal(second.transport, 'quic-direct');
  assert.deepEqual(second.result.endpoint, { host: '10.0.0.8', port: 4433 });
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
  assert.equal(h.disconnects[0].serial, 1);
});

test('newer peer-record sequence reconnects after peer restart even when endpoint is unchanged', async () => {
  const endpoint = 'quic://198.51.100.20:4433';
  const h = harness(record({ sequence: 7, endpoint }));

  const first = await h.router.send('truyn:node:peer-b', { id: 'before-restart' }, { allowRelayFallback: false });
  assert.equal(first.result.serial, 1);

  h.setRecord(record({ sequence: 8, endpoint }));
  const second = await h.router.send('truyn:node:peer-b', { id: 'after-restart' }, { allowRelayFallback: false });

  assert.equal(second.result.serial, 2);
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
});
