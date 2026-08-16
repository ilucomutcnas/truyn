import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SEMANTIC_INDEX_STORE_VERSION = 1;

const clone = (value) => value == null ? value : structuredClone(value);
const keyHash = (value) => createHash('sha256').update(String(value)).digest('hex');

function assertRootCid(rootCid) {
  if (typeof rootCid !== 'string' || !rootCid.startsWith('truyn:ctx:')) throw new Error('semantic index root CID is required');
}

function assertBlockCid(blockCid) {
  if (typeof blockCid !== 'string' || !blockCid.startsWith('truyn:ctxb:')) throw new Error('semantic index block CID is required');
}

function assertVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('semantic index vector is invalid');
  }
}

function normalizeVectorEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('semantic index vector entries must be an array');
  return entries.map((entry) => {
    assertBlockCid(entry?.cid);
    assertVector(entry?.vector);
    return { cid:entry.cid, vector:[...entry.vector] };
  });
}

function normalizeRootSnapshot(snapshot) {
  assertRootCid(snapshot?.cid);
  if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) throw new Error('semantic index root blocks are required');
  if (snapshot.manifest?.cid !== snapshot.cid) throw new Error('semantic index root manifest CID mismatch');
  return clone(snapshot);
}

export function createMemorySemanticIndexStore() {
  const roots = new Map();
  const vectors = new Map();
  const metrics = { rootReads:0, rootWrites:0, rootDeletes:0, vectorReads:0, vectorHits:0, vectorWrites:0 };

  return {
    kind:'memory',
    durable:false,
    async loadRoot(rootCid) {
      assertRootCid(rootCid);
      metrics.rootReads += 1;
      return clone(roots.get(rootCid) || null);
    },
    async saveRoot(snapshot) {
      const normalized = normalizeRootSnapshot(snapshot);
      roots.set(normalized.cid, normalized);
      metrics.rootWrites += 1;
    },
    async removeRoot(rootCid) {
      assertRootCid(rootCid);
      const removed = roots.delete(rootCid);
      if (removed) metrics.rootDeletes += 1;
      return removed;
    },
    async loadVectors(blockCids) {
      if (!Array.isArray(blockCids)) throw new Error('semantic index block CIDs must be an array');
      const result = new Map();
      for (const cid of blockCids) {
        assertBlockCid(cid);
        metrics.vectorReads += 1;
        if (vectors.has(cid)) {
          metrics.vectorHits += 1;
          result.set(cid, [...vectors.get(cid)]);
        }
      }
      return result;
    },
    async saveVectors(entries) {
      const normalized = normalizeVectorEntries(entries);
      for (const { cid, vector } of normalized) {
        if (!vectors.has(cid)) metrics.vectorWrites += 1;
        vectors.set(cid, vector);
      }
    },
    stats() {
      return { ...metrics, roots:roots.size, vectors:vectors.size, kind:'memory', durable:false };
    }
  };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive:true, mode:0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding:'utf8', mode:0o600 });
  await rename(temporary, filePath);
}

/**
 * Durable single-node reference store for semantic root manifests and immutable
 * block vectors. Filenames are hashes of CIDs so the store is portable across
 * filesystems; the original CID is retained inside every record and verified on
 * read. Multi-replica deployments can implement the same async store contract
 * using a shared database/object store without changing the semantic router.
 */
export function createFileSemanticIndexStore({ directory } = {}) {
  if (typeof directory !== 'string' || directory.trim().length === 0) throw new Error('semantic index store directory is required');
  const rootDirectory = path.resolve(directory);
  const rootsDirectory = path.join(rootDirectory, 'roots');
  const vectorsDirectory = path.join(rootDirectory, 'vectors');
  const metrics = { rootReads:0, rootHits:0, rootWrites:0, rootDeletes:0, vectorReads:0, vectorHits:0, vectorWrites:0 };

  const rootPath = (cid) => path.join(rootsDirectory, `${keyHash(cid)}.json`);
  const vectorPath = (cid) => path.join(vectorsDirectory, `${keyHash(cid)}.json`);

  return {
    kind:'file',
    durable:true,
    directory:rootDirectory,
    async loadRoot(rootCid) {
      assertRootCid(rootCid);
      metrics.rootReads += 1;
      const record = await readJson(rootPath(rootCid));
      if (!record) return null;
      if (record.storeVersion !== SEMANTIC_INDEX_STORE_VERSION || record.cid !== rootCid) throw new Error('semantic_index_root_store_corrupt');
      metrics.rootHits += 1;
      return normalizeRootSnapshot(record.snapshot);
    },
    async saveRoot(snapshot) {
      const normalized = normalizeRootSnapshot(snapshot);
      await atomicWrite(rootPath(normalized.cid), {
        storeVersion:SEMANTIC_INDEX_STORE_VERSION,
        cid:normalized.cid,
        snapshot:normalized
      });
      metrics.rootWrites += 1;
    },
    async removeRoot(rootCid) {
      assertRootCid(rootCid);
      try {
        await rm(rootPath(rootCid));
        metrics.rootDeletes += 1;
        return true;
      } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    },
    async loadVectors(blockCids) {
      if (!Array.isArray(blockCids)) throw new Error('semantic index block CIDs must be an array');
      const result = new Map();
      await Promise.all(blockCids.map(async (cid) => {
        assertBlockCid(cid);
        metrics.vectorReads += 1;
        const record = await readJson(vectorPath(cid));
        if (!record) return;
        if (record.storeVersion !== SEMANTIC_INDEX_STORE_VERSION || record.cid !== cid) throw new Error('semantic_index_vector_store_corrupt');
        assertVector(record.vector);
        metrics.vectorHits += 1;
        result.set(cid, [...record.vector]);
      }));
      return result;
    },
    async saveVectors(entries) {
      const normalized = normalizeVectorEntries(entries);
      await Promise.all(normalized.map(async ({ cid, vector }) => {
        const filePath = vectorPath(cid);
        const existing = await readJson(filePath);
        if (existing) {
          if (existing.storeVersion !== SEMANTIC_INDEX_STORE_VERSION || existing.cid !== cid) throw new Error('semantic_index_vector_store_corrupt');
          assertVector(existing.vector);
          return;
        }
        await atomicWrite(filePath, { storeVersion:SEMANTIC_INDEX_STORE_VERSION, cid, vector });
        metrics.vectorWrites += 1;
      }));
    },
    stats() {
      return { ...metrics, kind:'file', durable:true, directory:rootDirectory };
    }
  };
}
