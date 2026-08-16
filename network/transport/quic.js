import { createHmac, randomFillSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { QUICSocket, QUICServer, QUICClient, events } from '@matrixai/quic';
import { verifyEnvelope } from '../../core/protocol/index.js';
import { createSessionHello, createSessionAccept, verifySessionHello, verifySessionAccept, sessionId, SessionReplayCache } from '../sessions/authenticated-session.js';

export const TRUYN_QUIC_ALPN = 'truyn/1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function arrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function serverCrypto() {
  const key = arrayBuffer(randomBytes(32));
  return {
    key,
    ops: {
      async sign(secret, data) {
        return arrayBuffer(createHmac('sha256', Buffer.from(secret)).update(Buffer.from(data)).digest());
      },
      async verify(secret, data, signature) {
        const expected = createHmac('sha256', Buffer.from(secret)).update(Buffer.from(data)).digest();
        const actual = Buffer.from(signature);
        return actual.length === expected.length && timingSafeEqual(actual, expected);
      }
    }
  };
}

const clientCrypto = { ops: { async randomBytes(data) { randomFillSync(new Uint8Array(data)); } } };

async function readAll(readable, maxBytes = 1_048_576) {
  const reader = readable.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) throw new Error('quic_message_too_large');
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function writeJson(stream, value) {
  const writer = stream.writable.getWriter();
  try {
    await writer.write(encoder.encode(JSON.stringify(value)));
    await writer.close();
  } finally { writer.releaseLock(); }
}

async function requestJson(connection, value, maxBytes) {
  const stream = connection.newStream('bidi');
  const responseP = readAll(stream.readable, maxBytes);
  await writeJson(stream, value);
  const body = await responseP;
  return JSON.parse(decoder.decode(body));
}

function transportBinding(connection) {
  const meta = connection.meta();
  const endpoints = [`${meta.localHost}:${meta.localPort}`, `${meta.remoteHost}:${meta.remotePort}`].sort();
  return `quic:${endpoints.join('|')}`;
}

export class TruynQuicTransport {
  constructor({ identity, host = '0.0.0.0', port = 0, tls, maxMessageBytes = 1_048_576 } = {}) {
    if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('QUIC transport identity is required');
    if (!tls?.key || !tls?.cert) throw new Error('QUIC server TLS key and certificate are required');
    this.identity = identity;
    this.host = host;
    this.port = port;
    this.tls = tls;
    this.maxMessageBytes = maxMessageBytes;
    this.socket = new QUICSocket({});
    this.server = null;
    this.clients = new Set();
    this.serverSessions = new WeakMap();
    this.clientSessions = new WeakMap();
    this.replayCache = new SessionReplayCache();
    this.envelopeHandler = null;
  }

  onEnvelope(handler) {
    this.envelopeHandler = typeof handler === 'function' ? handler : null;
    return this;
  }

  async start() {
    await this.socket.start({ host: this.host, port: this.port, reuseAddr: true });
    this.server = new QUICServer({
      crypto: serverCrypto(),
      socket: this.socket,
      config: {
        key: this.tls.key,
        cert: this.tls.cert,
        ca: this.tls.ca,
        verifyPeer: false,
        applicationProtos: [TRUYN_QUIC_ALPN],
        maxIdleTimeout: 30_000,
        keepAliveIntervalTime: 10_000
      }
    });
    this.server.addEventListener(events.EventQUICServerConnection.name, (event) => this.#attachServerConnection(event.detail));
    await this.server.start();
    this.host = this.socket.host;
    this.port = this.socket.port;
    return { host: this.host, port: this.port, endpoint: `quic://${this.host}:${this.port}` };
  }

  #attachServerConnection(connection) {
    connection.addEventListener(events.EventQUICConnectionStream.name, (event) => {
      void this.#handleServerStream(connection, event.detail).catch(() => event.detail.cancel?.(new Error('truyn_quic_stream_failed')));
    });
  }

  async #handleServerStream(connection, stream) {
    const bytes = await readAll(stream.readable, this.maxMessageBytes);
    let message;
    try { message = JSON.parse(decoder.decode(bytes)); } catch { await writeJson(stream, { ok: false, error: 'invalid_json' }); return; }

    if (message?.kind === 'session-hello') {
      const verification = verifySessionHello(message.hello, { replayCache: this.replayCache });
      if (!verification.ok) { await writeJson(stream, { ok: false, error: verification.reason }); return; }
      const binding = transportBinding(connection);
      const accept = createSessionAccept({ identity: this.identity, hello: message.hello, transportBinding: binding });
      const id = sessionId(message.hello, accept);
      this.serverSessions.set(connection, { id, peerNodeId: message.hello.nodeId, peerPublicKey: message.hello.publicKey, binding });
      await writeJson(stream, { ok: true, accept, sessionId: id });
      return;
    }

    if (message?.kind === 'envelope') {
      const session = this.serverSessions.get(connection);
      if (!session || message.sessionId !== session.id) { await writeJson(stream, { ok: false, error: 'quic_session_required' }); return; }
      const verification = verifyEnvelope(message.envelope);
      if (!verification.ok) { await writeJson(stream, { ok: false, error: verification.reason }); return; }
      if (message.envelope.from !== session.peerNodeId || message.envelope.publicKey !== session.peerPublicKey) { await writeJson(stream, { ok: false, error: 'quic_session_sender_mismatch' }); return; }
      if (!this.envelopeHandler) { await writeJson(stream, { ok: false, error: 'no_envelope_handler' }); return; }
      const result = await this.envelopeHandler(message.envelope, { peerNodeId: session.peerNodeId, transport: 'quic', connection });
      await writeJson(stream, { ok: true, result: result ?? null });
      return;
    }

    await writeJson(stream, { ok: false, error: 'unsupported_quic_message' });
  }

  async connect({ host, port, serverName = host, ca = this.tls.ca } = {}) {
    const client = await QUICClient.createQUICClient({
      host,
      port,
      serverName,
      socket: this.socket,
      crypto: clientCrypto,
      config: {
        ca,
        verifyPeer: Boolean(ca),
        applicationProtos: [TRUYN_QUIC_ALPN],
        maxIdleTimeout: 30_000,
        keepAliveIntervalTime: 10_000
      }
    });
    this.clients.add(client);
    const hello = createSessionHello({ identity: this.identity, endpoints: [`quic://${this.host}:${this.port}`] });
    const response = await requestJson(client.connection, { kind: 'session-hello', hello }, this.maxMessageBytes);
    if (!response?.ok) { await client.destroy({ force: true }); throw new Error(response?.error || 'quic_session_rejected'); }
    const binding = transportBinding(client.connection);
    const verification = verifySessionAccept(response.accept, hello, { expectedTransportBinding: binding });
    if (!verification.ok) { await client.destroy({ force: true }); throw new Error(`quic_session_accept_invalid:${verification.reason}`); }
    const expectedSessionId = sessionId(hello, response.accept);
    if (response.sessionId !== expectedSessionId) { await client.destroy({ force: true }); throw new Error('quic_session_id_mismatch'); }
    this.clientSessions.set(client.connection, { id: expectedSessionId, peerNodeId: response.accept.nodeId, peerPublicKey: response.accept.publicKey, binding });
    return client;
  }

  async sendEnvelope(client, envelope) {
    const session = this.clientSessions.get(client?.connection);
    if (!session) throw new Error('authenticated QUIC session is required');
    const verification = verifyEnvelope(envelope);
    if (!verification.ok) throw new Error(`invalid envelope: ${verification.reason}`);
    if (envelope.from !== this.identity.nodeId) throw new Error('outbound envelope sender mismatch');
    const response = await requestJson(client.connection, { kind: 'envelope', sessionId: session.id, envelope }, this.maxMessageBytes);
    if (!response?.ok) throw new Error(response?.error || 'quic_envelope_rejected');
    return response.result;
  }

  async close() {
    const clients = [...this.clients];
    this.clients.clear();
    await Promise.allSettled(clients.map((client) => client.destroy({ force: true })));
    if (this.server) await this.server.stop({ force: true });
    await this.socket.stop({ force: true });
    this.server = null;
  }
}
