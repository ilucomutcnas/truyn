import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey, publicKeyFingerprint } from '../protocol/index.js';

export const SOURCE_OWNER_PKI_VERSION = 2;
export const SOURCE_OWNER_PROTOCOL = 'truyn-source-owner-v2';
export const SOURCE_DELEGATION_PROTOCOL = 'truyn-source-delegation-v2';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
const iso = (value, label) => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is invalid`);
  return parsed.toISOString();
};
const scopes = (value) => [...new Set((value || []).filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort();

export function sourceOwnerIdFromPublicKey(publicKeyPem) {
  return `truyn:source-owner:${publicKeyFingerprint(publicKeyPem)}`;
}

export function createSourceOwnerCertificate({ identity, sourceNamespaces = ['*'], issuedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString() } = {}) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('source owner identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('source owner identity key mismatch');
  const issued = iso(issuedAt, 'issuedAt');
  const expires = iso(expiresAt, 'expiresAt');
  if (new Date(expires) <= new Date(issued)) throw new Error('source owner certificate expiry is invalid');
  const body = {
    protocol: SOURCE_OWNER_PROTOCOL,
    version: SOURCE_OWNER_PKI_VERSION,
    sourceOwnerId: sourceOwnerIdFromPublicKey(identity.publicKeyPem),
    rootNodeId: identity.nodeId,
    sourceNamespaces: scopes(sourceNamespaces)
  };
  const certificateId = `truyn:source-owner-cert:${digest(body).slice(7)}`;
  const signed = { certificateId, body, issuedAt: issued, expiresAt: expires };
  return { ...signed, publicKey: identity.publicKeyPem, signature: signValue(signed, identity.privateKeyPem) };
}

export function verifySourceOwnerCertificate(certificate, { now = Date.now() } = {}) {
  try {
    if (!certificate?.certificateId || !certificate?.body || !certificate?.publicKey || !certificate?.signature) return { ok: false, reason: 'source_owner_certificate_missing_field' };
    if (certificate.body.protocol !== SOURCE_OWNER_PROTOCOL || certificate.body.version !== SOURCE_OWNER_PKI_VERSION) return { ok: false, reason: 'source_owner_protocol_mismatch' };
    if (sourceOwnerIdFromPublicKey(certificate.publicKey) !== certificate.body.sourceOwnerId) return { ok: false, reason: 'source_owner_id_key_mismatch' };
    if (nodeIdFromPublicKey(certificate.publicKey) !== certificate.body.rootNodeId) return { ok: false, reason: 'source_owner_node_key_mismatch' };
    if (certificate.certificateId !== `truyn:source-owner-cert:${digest(certificate.body).slice(7)}`) return { ok: false, reason: 'source_owner_content_id_mismatch' };
    const issued = new Date(certificate.issuedAt).getTime();
    const expires = new Date(certificate.expiresAt).getTime();
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || now >= expires) return { ok: false, reason: 'source_owner_certificate_expired_or_invalid' };
    const signed = { certificateId: certificate.certificateId, body: certificate.body, issuedAt: certificate.issuedAt, expiresAt: certificate.expiresAt };
    return verifyValue(signed, certificate.signature, certificate.publicKey) ? { ok: true, sourceOwnerId: certificate.body.sourceOwnerId } : { ok: false, reason: 'source_owner_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function createDelegationCertificate({ ownerIdentity, ownerCertificate, delegateIdentity, delegatePublicKey = null, delegateNodeId = null, delegationScopes = ['trust.verify'], sourceNamespaces = ['*'], issuedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString() } = {}) {
  const ownerCheck = verifySourceOwnerCertificate(ownerCertificate);
  if (!ownerCheck.ok) throw new Error(`invalid source owner certificate: ${ownerCheck.reason}`);
  if (!ownerIdentity?.privateKeyPem || ownerIdentity.nodeId !== ownerCertificate.body.rootNodeId || ownerIdentity.publicKeyPem !== ownerCertificate.publicKey) throw new Error('delegation must be signed by source owner root identity');
  const publicKey = delegateIdentity?.publicKeyPem || delegatePublicKey;
  const nodeId = delegateIdentity?.nodeId || delegateNodeId;
  if (!publicKey || !nodeId || nodeIdFromPublicKey(publicKey) !== nodeId) throw new Error('delegated verifier key mismatch');
  const issued = iso(issuedAt, 'issuedAt');
  const expires = iso(expiresAt, 'expiresAt');
  if (new Date(expires) <= new Date(issued) || new Date(expires) > new Date(ownerCertificate.expiresAt)) throw new Error('delegation expiry exceeds owner authority');
  const body = {
    protocol: SOURCE_DELEGATION_PROTOCOL,
    version: SOURCE_OWNER_PKI_VERSION,
    sourceOwnerId: ownerCertificate.body.sourceOwnerId,
    rootCertificateId: ownerCertificate.certificateId,
    delegateNodeId: nodeId,
    delegateKeyFingerprint: publicKeyFingerprint(publicKey),
    scopes: scopes(delegationScopes),
    sourceNamespaces: scopes(sourceNamespaces)
  };
  const delegationId = `truyn:source-delegation:${digest(body).slice(7)}`;
  const signed = { delegationId, body, issuedAt: issued, expiresAt: expires };
  return { ...signed, delegatePublicKey: publicKey, issuerPublicKey: ownerIdentity.publicKeyPem, signature: signValue(signed, ownerIdentity.privateKeyPem) };
}

export function verifyDelegationCertificate(delegation, ownerCertificate, { now = Date.now(), requiredScope = null } = {}) {
  try {
    const ownerCheck = verifySourceOwnerCertificate(ownerCertificate, { now });
    if (!ownerCheck.ok) return { ok: false, reason: ownerCheck.reason };
    if (!delegation?.delegationId || !delegation?.body || !delegation?.delegatePublicKey || !delegation?.issuerPublicKey || !delegation?.signature) return { ok: false, reason: 'delegation_missing_field' };
    if (delegation.body.protocol !== SOURCE_DELEGATION_PROTOCOL || delegation.body.version !== SOURCE_OWNER_PKI_VERSION) return { ok: false, reason: 'delegation_protocol_mismatch' };
    if (delegation.body.sourceOwnerId !== ownerCertificate.body.sourceOwnerId || delegation.body.rootCertificateId !== ownerCertificate.certificateId) return { ok: false, reason: 'delegation_owner_mismatch' };
    if (delegation.issuerPublicKey !== ownerCertificate.publicKey) return { ok: false, reason: 'delegation_issuer_key_mismatch' };
    if (nodeIdFromPublicKey(delegation.delegatePublicKey) !== delegation.body.delegateNodeId || publicKeyFingerprint(delegation.delegatePublicKey) !== delegation.body.delegateKeyFingerprint) return { ok: false, reason: 'delegation_delegate_key_mismatch' };
    if (delegation.delegationId !== `truyn:source-delegation:${digest(delegation.body).slice(7)}`) return { ok: false, reason: 'delegation_content_id_mismatch' };
    const issued = new Date(delegation.issuedAt).getTime();
    const expires = new Date(delegation.expiresAt).getTime();
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || now >= expires || expires > new Date(ownerCertificate.expiresAt).getTime()) return { ok: false, reason: 'delegation_expired_or_invalid' };
    if (requiredScope && !delegation.body.scopes.includes(requiredScope)) return { ok: false, reason: 'delegation_scope_missing' };
    const signed = { delegationId: delegation.delegationId, body: delegation.body, issuedAt: delegation.issuedAt, expiresAt: delegation.expiresAt };
    return verifyValue(signed, delegation.signature, delegation.issuerPublicKey)
      ? { ok: true, delegationId: delegation.delegationId, sourceOwnerId: delegation.body.sourceOwnerId, delegateNodeId: delegation.body.delegateNodeId }
      : { ok: false, reason: 'delegation_signature_invalid' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function authorityChainDigest(ownerCertificate, delegation) {
  return digest({ ownerCertificate, delegation });
}
