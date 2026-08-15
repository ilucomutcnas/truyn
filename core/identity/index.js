import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';

export function createIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  return {
    nodeId: nodeIdFromPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
    algorithm: 'Ed25519'
  };
}

export function signValue(value, privateKeyPem) {
  return cryptoSign(null, Buffer.from(canonicalize(value)), privateKeyPem).toString('base64');
}

export function verifyValue(value, signature, publicKeyPem) {
  return cryptoVerify(
    null,
    Buffer.from(canonicalize(value)),
    publicKeyPem,
    Buffer.from(signature, 'base64')
  );
}
