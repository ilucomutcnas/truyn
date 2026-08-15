from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))

# node/client.js
replace_once(
    'node/client.js',
    "import { createIdentity } from '../core/identity/index.js';\n",
    "import { createIdentity } from '../core/identity/index.js';\nimport { renderContextSelection, verifyContextManifest, verifyContextSelection } from '../core/context/index.js';\n"
)
replace_once(
    'node/client.js',
    "    this.fastSocketChainWaiters = new Map();\n",
    "    this.fastSocketChainWaiters = new Map();\n    this.contextManifestCache = new Map();\n"
)
node_methods = r'''
  async putContext(blocks, { readers = [], metadata = {} } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before putting context');
    const payload = { blocks, readers, metadata };
    const frame = this.compactFrame('CONTEXT_PUT', payload);
    const requestBody = { frame, payload };
    const result = await requestJson(`${this.relayUrl}/v1/contexts`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify(requestBody)
    });
    if (result.manifest) this.contextManifestCache.set(result.cid, result.manifest);
    return { ...result, frame, payload, transferBytes: bytes(requestBody) + bytes(result) };
  }

  async deltaContext(baseCid, ops, { readers = [], metadata = {} } = {}) {
    if (!this.sessionToken) throw new Error('Node must register before updating context');
    const payload = { baseCid, ops, readers, metadata };
    const frame = this.compactFrame('CONTEXT_DELTA', payload);
    const requestBody = { frame, payload };
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(baseCid)}/delta`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify(requestBody)
    });
    if (result.manifest) this.contextManifestCache.set(result.cid, result.manifest);
    return { ...result, frame, payload, transferBytes: bytes(requestBody) + bytes(result) };
  }

  async contextManifest(cid) {
    if (!this.sessionToken) throw new Error('Node must register before reading context');
    if (this.contextManifestCache.has(cid)) {
      return { manifest: this.contextManifestCache.get(cid), cacheHit: true, transferBytes: 0 };
    }
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(cid)}/manifest`, {
      headers: { authorization: `Bearer ${this.sessionToken}` }
    });
    const verification = verifyContextManifest(result.manifest, cid);
    if (!verification.ok) throw new Error(`Context manifest verification failed: ${verification.reason}`);
    this.contextManifestCache.set(cid, result.manifest);
    return { manifest: result.manifest, cacheHit: false, transferBytes: bytes(result) };
  }

  async selectContext(cid, ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Context selection requires block ids');
    const manifestResult = await this.contextManifest(cid);
    const requestBody = { ids };
    const result = await requestJson(`${this.relayUrl}/v1/contexts/${encodeURIComponent(cid)}/select`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.sessionToken}` },
      body: JSON.stringify(requestBody)
    });
    const verification = verifyContextSelection(manifestResult.manifest, result.blocks, cid);
    if (!verification.ok) throw new Error(`Context selection verification failed: ${verification.reason}`);
    const selectedContentBytes = (result.blocks || []).reduce((sum, block) => sum + Buffer.byteLength(block.text || ''), 0);
    return {
      cid,
      blocks: result.blocks || [],
      manifestCacheHit: manifestResult.cacheHit,
      manifestTransferBytes: manifestResult.transferBytes,
      selectionTransferBytes: bytes(requestBody) + bytes(result),
      transferBytes: manifestResult.transferBytes + bytes(requestBody) + bytes(result),
      selectedContentBytes
    };
  }

  async materializeContextRefs(value) {
    const emptyStats = () => ({
      contextRefs: 0,
      selectedBlocks: 0,
      selectedContentBytes: 0,
      manifestTransferBytes: 0,
      selectionTransferBytes: 0,
      contextTransferBytes: 0
    });
    const merge = (target, source) => {
      for (const key of Object.keys(target)) target[key] += source[key] || 0;
      return target;
    };
    const walk = async (item) => {
      if (Array.isArray(item)) {
        const stats = emptyStats();
        const values = [];
        for (const child of item) {
          const resolved = await walk(child);
          values.push(resolved.value);
          merge(stats, resolved.stats);
        }
        return { value: values, stats };
      }
      if (item && typeof item === 'object') {
        if (Object.keys(item).length === 1 && item.$context) {
          const ref = item.$context;
          if (!ref.cid || !Array.isArray(ref.ids)) throw new Error('Invalid $context reference');
          const selected = await this.selectContext(ref.cid, ref.ids);
          return {
            value: renderContextSelection(selected.blocks),
            stats: {
              contextRefs: 1,
              selectedBlocks: selected.blocks.length,
              selectedContentBytes: selected.selectedContentBytes,
              manifestTransferBytes: selected.manifestTransferBytes,
              selectionTransferBytes: selected.selectionTransferBytes,
              contextTransferBytes: selected.transferBytes
            }
          };
        }
        const stats = emptyStats();
        const entries = [];
        for (const [key, child] of Object.entries(item)) {
          const resolved = await walk(child);
          entries.push([key, resolved.value]);
          merge(stats, resolved.stats);
        }
        return { value: Object.fromEntries(entries), stats };
      }
      return { value: item, stats: emptyStats() };
    };
    return walk(value);
  }

'''
replace_once('node/client.js', '  async revoke(targetId, reason = \'revoked_by_owner\') {\n', node_methods + "  async revoke(targetId, reason = 'revoked_by_owner') {\n")

# network/relay/server.js
replace_once(
    'network/relay/server.js',
    "import { trustabilityLite } from '../../core/trust/index.js';\n",
    "import { trustabilityLite } from '../../core/trust/index.js';\nimport { applyContextDelta, buildContextDocument } from '../../core/context/index.js';\n"
)
replace_once(
    'network/relay/server.js',
    "  const chains = new Map();\n  const stats = new Map();\n",
    "  const chains = new Map();\n  const contexts = new Map();\n  const stats = new Map();\n"
)
context_helpers = r'''

  function contextReaders(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.length)) {
      throw new Error('context readers must be node-id strings');
    }
    return [...new Set(value)];
  }

  function canReadContext(record, nodeId) {
    return Boolean(record && (record.owners.has(nodeId) || record.readers.has(nodeId)));
  }

  function saveContext(ownerNodeId, document, { readers = [], metadata = {}, baseCid = null, deltaOps = null } = {}) {
    const existing = contexts.get(document.cid);
    if (existing) {
      existing.owners.add(ownerNodeId);
      for (const reader of contextReaders(readers)) existing.readers.add(reader);
      return existing;
    }
    const record = {
      cid: document.cid,
      blocks: document.blocks,
      manifest: document.manifest,
      contentBytes: document.contentBytes,
      serializedBytes: document.serializedBytes,
      owners: new Set([ownerNodeId]),
      readers: new Set(contextReaders(readers)),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      baseCid,
      deltaOps,
      createdAt: new Date().toISOString()
    };
    contexts.set(record.cid, record);
    return record;
  }
'''
replace_once('network/relay/server.js', '  function registerFastWaiter(req, res, nodeId, waitMs) {\n', context_helpers + '\n  function registerFastWaiter(req, res, nodeId, waitMs) {\n')
replace_once(
    'network/relay/server.js',
    "          pendingChains: [...chains.values()].filter((chain) => chain.status === 'running').length,\n          providerSockets:",
    "          pendingChains: [...chains.values()].filter((chain) => chain.status === 'running').length,\n          contexts: contexts.size,\n          providerSockets:"
)
context_routes = r'''

      if (req.method === 'POST' && url.pathname === '/v1/contexts') {
        const ownerNodeId = authenticatedNodeId(req);
        if (!ownerNodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const owner = nodes.get(ownerNodeId);
        const { frame, payload } = await readJson(req);
        const verification = verifyCompactFrame(frame, payload, owner.publicKey, { allowedTypes: ['CONTEXT_PUT'] });
        if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
        const document = buildContextDocument(payload?.blocks);
        const record = saveContext(ownerNodeId, document, {
          readers: payload?.readers || [],
          metadata: payload?.metadata || {}
        });
        touch(ownerNodeId);
        return json(res, 200, {
          ok: true,
          cid: record.cid,
          manifest: record.manifest,
          contentBytes: record.contentBytes,
          serializedBytes: record.serializedBytes
        });
      }

      const contextRoute = url.pathname.match(/^\/v1\/contexts\/([^/]+)\/(manifest|select|delta)$/);
      if (contextRoute) {
        const nodeId = authenticatedNodeId(req);
        if (!nodeId) return json(res, 401, { ok: false, error: 'unauthorized' });
        const cid = decodeURIComponent(contextRoute[1]);
        const action = contextRoute[2];
        const record = contexts.get(cid);
        if (!record) return json(res, 404, { ok: false, error: 'context_not_found' });

        if (req.method === 'GET' && action === 'manifest') {
          if (!canReadContext(record, nodeId)) return json(res, 403, { ok: false, error: 'context_forbidden' });
          touch(nodeId);
          return json(res, 200, { ok: true, cid, manifest: record.manifest });
        }

        if (req.method === 'POST' && action === 'select') {
          if (!canReadContext(record, nodeId)) return json(res, 403, { ok: false, error: 'context_forbidden' });
          const { ids } = await readJson(req);
          if (!Array.isArray(ids) || ids.length === 0 || ids.length > 32 || ids.some((id) => typeof id !== 'string')) {
            return json(res, 400, { ok: false, error: 'invalid_context_selection' });
          }
          const byId = new Map(record.blocks.map((block) => [block.id, block]));
          const selected = [];
          for (const id of ids) {
            const block = byId.get(id);
            if (!block) return json(res, 404, { ok: false, error: 'context_block_not_found', blockId: id });
            selected.push({ id: block.id, cid: block.cid, text: block.text, bytes: block.bytes });
          }
          touch(nodeId);
          return json(res, 200, { ok: true, cid, blocks: selected });
        }

        if (req.method === 'POST' && action === 'delta') {
          if (!record.owners.has(nodeId)) return json(res, 403, { ok: false, error: 'context_owner_required' });
          const owner = nodes.get(nodeId);
          const { frame, payload } = await readJson(req);
          const verification = verifyCompactFrame(frame, payload, owner.publicKey, { allowedTypes: ['CONTEXT_DELTA'] });
          if (!verification.ok) return json(res, 400, { ok: false, error: verification.reason });
          if (payload?.baseCid !== cid) return json(res, 400, { ok: false, error: 'context_base_cid_mismatch' });
          const nextBlocks = applyContextDelta(record.blocks, payload?.ops);
          const document = buildContextDocument(nextBlocks);
          const inheritedReaders = [...record.readers];
          const readers = [...new Set([...inheritedReaders, ...contextReaders(payload?.readers || [])])];
          const child = saveContext(nodeId, document, {
            readers,
            metadata: payload?.metadata || record.metadata,
            baseCid: cid,
            deltaOps: payload?.ops
          });
          touch(nodeId);
          return json(res, 200, {
            ok: true,
            cid: child.cid,
            baseCid: cid,
            manifest: child.manifest,
            contentBytes: child.contentBytes,
            serializedBytes: child.serializedBytes,
            deltaBytes: Buffer.byteLength(JSON.stringify(payload?.ops || []))
          });
        }
      }
'''
replace_once('network/relay/server.js', "      if (req.method === 'POST' && url.pathname === '/v1/fast/chains') {\n", context_routes + "\n      if (req.method === 'POST' && url.pathname === '/v1/fast/chains') {\n")
replace_once(
    'network/relay/server.js',
    '    state: { nodes, sessions, offers, events, fastEvents, providerSockets, requests, chains, stats },\n',
    '    state: { nodes, sessions, offers, events, fastEvents, providerSockets, requests, chains, contexts, stats },\n'
)

print('context runtime patch applied')
