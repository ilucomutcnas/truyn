import test from 'node:test';
import assert from 'node:assert/strict';
import { QuicDiscoveryRpc } from '../network/discovery/quic-rpc.js';

function peer({ sequence, endpoint }) {
  return { nodeId: 'truyn:node:peer-b', sequence, endpoints: [endpoint] };
}

function harness() {
  const connects = [];
  const disconnects = [];
  const quic = {
    async connect(endpoint) {
      const client = { endpoint, serial: connects.length + 1 };
      connects.push(client);
      return client;
    },
    async disconnect(client) { disconnects.push(client); },
    async requestControl(client) { return { pong: true, serial: client.serial }; }
  };
  return { rpc: new QuicDiscoveryRpc({ quicTransport: quic, timeoutMs: 1_000 }), connects, disconnects };
}

test('DHT RPC reconnects when a newer signed peer record changes endpoint', async () => {
  const h = harness();
  const first = peer({ sequence: 4, endpoint: 'quic://203.0.113.30:4433' });
  const second = peer({ sequence: 5, endpoint: 'quic://10.20.0.7:4433' });

  assert.equal(await h.rpc.ping(first), true);
  assert.equal(h.connects.length, 1);
  assert.deepEqual(h.connects[0].endpoint, { host: '203.0.113.30', port: 4433 });

  assert.equal(await h.rpc.ping(second), true);
  assert.equal(h.connects.length, 2);
  assert.deepEqual(h.connects[1].endpoint, { host: '10.20.0.7', port: 4433 });
  assert.equal(h.disconnects.length, 1);
  assert.equal(h.disconnects[0].serial, 1);
});

test('DHT RPC reconnects after peer restart when sequence changes on the same endpoint', async () => {
  const h = harness();
  const endpoint = 'quic://198.51.100.44:4433';

  assert.equal(await h.rpc.ping(peer({ sequence: 20, endpoint })), true);
  assert.equal(await h.rpc.ping(peer({ sequence: 21, endpoint })), true);

  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
  assert.equal(h.disconnects[0].serial, 1);
});
