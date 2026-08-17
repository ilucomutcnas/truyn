import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';

export const STUN_MAGIC_COOKIE = 0x2112a442;
export const STUN_BINDING_REQUEST = 0x0001;
export const STUN_BINDING_SUCCESS = 0x0101;
export const STUN_ATTR_MAPPED_ADDRESS = 0x0001;
export const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020;

export function createBindingRequest({ transactionId = randomBytes(12) } = {}) {
  if (!Buffer.isBuffer(transactionId) || transactionId.length !== 12) throw new Error('STUN transactionId must be 12 bytes');
  const packet = Buffer.alloc(20);
  packet.writeUInt16BE(STUN_BINDING_REQUEST, 0);
  packet.writeUInt16BE(0, 2);
  packet.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  transactionId.copy(packet, 8);
  return { packet, transactionId };
}

function decodeAddress(attributeType, value, transactionId) {
  if (value.length < 4 || value[0] !== 0) return null;
  const family = value[1];
  let port = value.readUInt16BE(2);
  const xor = attributeType === STUN_ATTR_XOR_MAPPED_ADDRESS;
  if (xor) port ^= STUN_MAGIC_COOKIE >>> 16;
  if (family === 0x01 && value.length >= 8) {
    const bytes = Buffer.from(value.subarray(4, 8));
    if (xor) {
      const cookie = Buffer.alloc(4); cookie.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
      for (let i = 0; i < 4; i += 1) bytes[i] ^= cookie[i];
    }
    return { family: 'IPv4', address: [...bytes].join('.'), port };
  }
  if (family === 0x02 && value.length >= 20) {
    const bytes = Buffer.from(value.subarray(4, 20));
    if (xor) {
      const mask = Buffer.alloc(16); mask.writeUInt32BE(STUN_MAGIC_COOKIE, 0); transactionId.copy(mask, 4);
      for (let i = 0; i < 16; i += 1) bytes[i] ^= mask[i];
    }
    const words = [];
    for (let i = 0; i < 16; i += 2) words.push(bytes.readUInt16BE(i).toString(16));
    return { family: 'IPv6', address: words.join(':'), port };
  }
  return null;
}

export function parseBindingResponse(packet, transactionId) {
  if (!Buffer.isBuffer(packet) || packet.length < 20) throw new Error('STUN response is too short');
  if (packet.readUInt16BE(0) !== STUN_BINDING_SUCCESS) throw new Error('STUN response is not binding success');
  if (packet.readUInt32BE(4) !== STUN_MAGIC_COOKIE) throw new Error('STUN magic cookie mismatch');
  if (!packet.subarray(8, 20).equals(transactionId)) throw new Error('STUN transaction mismatch');
  const length = packet.readUInt16BE(2);
  const end = Math.min(packet.length, 20 + length);
  let mapped = null;
  let offset = 20;
  while (offset + 4 <= end) {
    const type = packet.readUInt16BE(offset);
    const size = packet.readUInt16BE(offset + 2);
    const start = offset + 4;
    if (start + size > end) break;
    if (type === STUN_ATTR_XOR_MAPPED_ADDRESS || (!mapped && type === STUN_ATTR_MAPPED_ADDRESS)) {
      const decoded = decodeAddress(type, packet.subarray(start, start + size), transactionId);
      if (decoded) mapped = decoded;
      if (type === STUN_ATTR_XOR_MAPPED_ADDRESS && decoded) return decoded;
    }
    offset = start + ((size + 3) & ~3);
  }
  if (!mapped) throw new Error('STUN response has no mapped address');
  return mapped;
}

export async function discoverMappedAddress({ host, port = 3478, family = 'udp4', timeoutMs = 2500, socket = null } = {}) {
  if (!host) throw new Error('STUN host is required');
  const owned = !socket;
  const udp = socket || dgram.createSocket(family);
  const { packet, transactionId } = createBindingRequest();
  try {
    if (owned) await new Promise((resolve, reject) => { udp.once('error', reject); udp.bind(0, () => { udp.off('error', reject); resolve(); }); });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => cleanup(new Error('stun_timeout')), timeoutMs);
      const onMessage = (message) => {
        try { cleanup(null, parseBindingResponse(message, transactionId)); } catch { /* unrelated datagram */ }
      };
      const onError = (error) => cleanup(error);
      const cleanup = (error, value) => {
        clearTimeout(timer); udp.off('message', onMessage); udp.off('error', onError);
        if (error) reject(error); else resolve(value);
      };
      udp.on('message', onMessage); udp.once('error', onError);
      udp.send(packet, port, host, (error) => { if (error) cleanup(error); });
    });
  } finally {
    if (owned) await new Promise((resolve) => udp.close(() => resolve()));
  }
}
