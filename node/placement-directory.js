import http from 'node:http';
import { URL } from 'node:url';
import {
  PlacementDirectoryPeer,
  placementResponsiblePeers,
  verifyPlacementRecord,
  verifyPlacementRevocation
} from '../core/network/placement-discovery.js';

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

async function readJson(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      const error = new Error('placement_directory_body_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('placement_directory_invalid_json');
    error.statusCode = 400;
    throw error;
  }
}

function json(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store'
  });
  response.end(payload);
}

function sanitizeError(error) {
  const allowed = new Set([
    'placement_directory_body_too_large',
    'placement_directory_invalid_json',
    'placement_record_invalid',
    'placement_revocation_invalid',
    'placement_directory_not_found'
  ]);
  return allowed.has(error?.message) ? error.message : 'placement_directory_request_failed';
}

export function createPlacementDirectoryHandler({
  peer,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  now = () => Date.now()
} = {}) {
  if (!(peer instanceof PlacementDirectoryPeer)) throw new Error('placement directory peer is required');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024) throw new Error('placement directory maxBodyBytes is invalid');

  return async function placementDirectoryHandler(request, response) {
    try {
      const url = new URL(request.url || '/', 'http://placement.directory');
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json(response, 200, { ok: true, protocol: 'truyn-placement-directory-v1', peerId: peer.peerId });
      }
      if (request.method === 'GET' && url.pathname === '/v1/placements') {
        const rootCid = url.searchParams.get('rootCid');
        if (!rootCid) return json(response, 400, { ok: false, error: 'placement_root_cid_required' });
        const records = peer.find(rootCid, { now: now() });
        return json(response, 200, { ok: true, peerId: peer.peerId, records });
      }
      if (request.method === 'POST' && url.pathname === '/v1/placements') {
        const body = await readJson(request, maxBodyBytes);
        const verification = verifyPlacementRecord(body.record, { now: now() });
        if (!verification.ok) return json(response, 400, { ok: false, error: 'placement_record_invalid', reason: verification.reason });
        const result = peer.ingestRecord(body.record, { now: now() });
        return json(response, result.accepted ? 202 : 409, { ok: result.accepted, peerId: peer.peerId, ...result });
      }
      if (request.method === 'POST' && url.pathname === '/v1/revocations') {
        const body = await readJson(request, maxBodyBytes);
        const verification = verifyPlacementRevocation(body.revocation);
        if (!verification.ok) return json(response, 400, { ok: false, error: 'placement_revocation_invalid', reason: verification.reason });
        const result = peer.ingestRevocation(body.revocation);
        return json(response, result.accepted ? 202 : 409, { ok: result.accepted, peerId: peer.peerId, ...result });
      }
      return json(response, 404, { ok: false, error: 'placement_directory_not_found' });
    } catch (error) {
      return json(response, error?.statusCode || 500, { ok: false, error: sanitizeError(error) });
    }
  };
}

export function createPlacementDirectoryServer(options = {}) {
  return http.createServer(createPlacementDirectoryHandler(options));
}

function normalizeBaseUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('placement directory URL must use http or https');
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function fetchJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('placement_directory_non_json_response');
  }
  if (!response.ok || body?.ok === false) {
    const error = new Error(body?.error || 'placement_directory_remote_failure');
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

export class HttpPlacementDirectoryClient {
  constructor({ peerId, baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
    if (typeof peerId !== 'string' || !peerId.trim()) throw new Error('placement directory client peerId is required');
    if (typeof fetchImpl !== 'function') throw new Error('placement directory fetch implementation is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error('placement directory timeoutMs is invalid');
    this.peerId = peerId.trim();
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetchJson(this.fetchImpl, `${this.baseUrl}${path}`, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async find(rootCid) {
    const body = await this.request(`/v1/placements?rootCid=${encodeURIComponent(rootCid)}`);
    return Array.isArray(body.records) ? body.records : [];
  }

  async publish(record) {
    const body = await this.request('/v1/placements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record })
    });
    return body;
  }

  async revoke(revocation) {
    const body = await this.request('/v1/revocations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revocation })
    });
    return body;
  }
}

export async function publishPlacementAcrossDirectories(record, directoryClients, { replicationFactor = 3 } = {}) {
  const responsible = placementResponsiblePeers(record.body.rootCid, directoryClients, { replicationFactor });
  const settled = await Promise.allSettled(responsible.map((client) => client.publish(record)));
  return {
    responsiblePeerIds: responsible.map((client) => client.peerId),
    accepted: settled.filter((item) => item.status === 'fulfilled').length,
    failed: settled.filter((item) => item.status === 'rejected').length
  };
}

export async function revokePlacementAcrossDirectories(revocation, directoryClients, { replicationFactor = 3 } = {}) {
  const responsible = placementResponsiblePeers(revocation.body.rootCid, directoryClients, { replicationFactor });
  const settled = await Promise.allSettled(responsible.map((client) => client.revoke(revocation)));
  return {
    responsiblePeerIds: responsible.map((client) => client.peerId),
    accepted: settled.filter((item) => item.status === 'fulfilled').length,
    failed: settled.filter((item) => item.status === 'rejected').length
  };
}
