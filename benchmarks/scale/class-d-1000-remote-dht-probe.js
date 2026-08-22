#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdentity } from '../../core/identity/index.js';
import { QUIC_DHT_METHOD_STORE } from '../../network/discovery/quic-rpc.js';
import { TruynQuicTransport } from '../../network/transport/quic.js';

export const INVALID_SIGNATURE_REJECTION = 'invalid_dht_record:dht_record_signature';

export function mutateSignature(record = {}) {
  if (!record || typeof record !== 'object' || typeof record.signature !== 'string' || record.signature.length < 8) {
    throw new Error('valid signed DHT record is required');
  }
  const replacement = record.signature[0] === 'A' ? 'B' : 'A';
  return { ...structuredClone(record), signature: `${replacement}${record.signature.slice(1)}` };
}

export function isExpectedInvalidSignatureRejection(reason) {
  return String(reason || '') === INVALID_SIGNATURE_REJECTION;
}

function parseQuicEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('quic://')) throw new Error('target QUIC endpoint is required');
  const url = new URL(value);
  const port = Number(url.port);
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid target QUIC endpoint');
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
}

export async function runRemoteInvalidSignedStateProbe({ targetEndpoint, record, tlsKey, tlsCert } = {}) {
  if (!tlsKey || !tlsCert) throw new Error('TLS key and certificate are required');
  const endpoint = parseQuicEndpoint(targetEndpoint);
  const forgedRecord = mutateSignature(record);
  const transport = new TruynQuicTransport({
    identity: createIdentity(),
    host: '0.0.0.0',
    port: 0,
    tls: { key: tlsKey, cert: tlsCert }
  });

  await transport.start();
  try {
    const client = await transport.connect({ host: endpoint.host, port: endpoint.port, serverName: endpoint.host });
    try {
      const result = await transport.requestControl(client, QUIC_DHT_METHOD_STORE, { record: forgedRecord });
      return {
        ok: false,
        transport: 'quic-control',
        targetEndpoint,
        targetRejected: false,
        acceptedCount: 1,
        rejectionReason: null,
        unexpectedResult: result ?? null
      };
    } catch (error) {
      const reason = error?.message || String(error);
      if (!isExpectedInvalidSignatureRejection(reason)) {
        const unexpected = new Error(`unexpected_remote_dht_rejection:${reason}`);
        unexpected.cause = error;
        throw unexpected;
      }
      return {
        ok: true,
        transport: 'quic-control',
        targetEndpoint,
        targetRejected: true,
        acceptedCount: 0,
        rejectionReason: reason
      };
    }
  } finally {
    await transport.close();
  }
}

async function main() {
  const [targetEndpoint, recordPath, tlsKeyPath, tlsCertPath] = process.argv.slice(2);
  if (!targetEndpoint || !recordPath || !tlsKeyPath || !tlsCertPath) {
    throw new Error('usage: class-d-1000-remote-dht-probe.js <targetEndpoint> <validRecord.json> <tlsKey> <tlsCert>');
  }
  const [record, tlsKey, tlsCert] = await Promise.all([
    readFile(resolve(recordPath), 'utf8').then(JSON.parse),
    readFile(resolve(tlsKeyPath), 'utf8'),
    readFile(resolve(tlsCertPath), 'utf8')
  ]);
  const result = await runRemoteInvalidSignedStateProbe({ targetEndpoint, record, tlsKey, tlsCert });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok && result.acceptedCount === 0 ? 0 : 1);
}

const executed = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executed) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) })}\n`);
    process.exit(2);
  });
}
