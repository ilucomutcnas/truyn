import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SEMANTIC_INDEX_STORE_VERSION } from './semantic-index-store.js';

const SHARDED_VECTOR_STORE_VERSION = 1;
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

function normalizeRootSnapshot(snapshot) {
  assertRootCid(snapshot?.cid);
  if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) throw new Error('semantic index root blocks are required');
  if (snapshot.manifest?.cid !== snapshot.cid) throw new Error('semantic index root manifest CID mismatch');
  return clone(snapshot);
}

function normalizeVectorEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('semantic index vector entries must be an array');
  return entries.map((entry) => {
    assertBlockCid(entry?.cid);
    assertVector(entry?.vector);
    return { cid:entry.cid, vector:[...entry.vector] };
  });
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

function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await fn(items[index], index);
    }
  }
  return Promise.all(Array.from({ length:Math.min(limit, items.length) }, worker)).then(() => output);
}

/**
 * Durable single-node scale store for semantic indexes.
 *
 * Root snapshots remain one immutable record per root CID, while block vectors
 * are grouped into deterministic hash shards. This avoids the 100k-block
 * failure mode where persistence creates one filesystem inode/read operation
 * per immutable block. The store keeps the same async contract consumed by
 * semantic-router-v2 and remains content-addressed by the original block CID.
 *
 * It is intentionally still a single-node reference store. Concurrent writers
 * inside one process are serialized per shard. Multi-replica deployments need
 * a shared store with CAS/lease semantics before claiming distributed
 * exactly-once vector creation.
 */
export function createShardedFileSemanticIndexStore({
  directory,
  shardPrefixLength = 2,
  ioConcurrency = 16
} = {}) {
  if (typeof directory !== 'string' || directory.trim().length === 0) throw new Error('semantic index store directory is required');
  if (!Number.isInteger(shardPrefixLength) || shardPrefixLength < 1 || shardPrefixLength > 4) {
    throw new Error('semantic index shardPrefixLength must be 1..4');
  }
  if (!Number.isInteger(ioConcurrency) || ioConcurrency < 1 || ioConcurrency > 64) {
    throw new Error('semantic index ioConcurrency must be 1..64');
  }

  const rootDirectory = path.resolve(directory);
  const rootsDirectory = path.join(rootDirectory, 'roots');
  const vectorsDirectory = path.join(rootDirectory, 'vector-shards');
  const shardFlights = new Map();
  const metrics = {
    rootReads:0,
    rootHits:0,
    rootWrites:0,
    rootDeletes:0,
    vectorReads:0,
    vectorHits:0,
    vectorWrites:0,
    shardReads:0,
    shardWrites:0,
    shardReadMisses:0
  };

  const rootPath = (cid) => path.join(rootsDirectory, `${keyHash(cid)}.json`);
  const shardId = (cid) => keyHash(cid).slice(0, shardPrefixLength);
  const shardPath = (id) => path.join(vectorsDirectory, `${id}.json`);

  function normalizeShard(record, id) {
    if (!record) return { storeVersion:SEMANTIC_INDEX_STORE_VERSION, shardVersion:SHARDED_VECTOR_STORE_VERSION, shard:id, vectors:{} };
    if (
      record.storeVersion !== SEMANTIC_INDEX_STORE_VERSION ||
      record.shardVersion !== SHARDED_VECTOR_STORE_VERSION ||
      record.shard !== id ||
      !record.vectors ||
      typeof record.vectors !== 'object' ||
      Array.isArray(record.vectors)
    ) throw new Error('semantic_index_vector_shard_corrupt');
    return record;
  }

  async function loadShard(id) {
    metrics.shardReads += 1;
    const record = await readJson(shardPath(id));
    if (!record) metrics.shardReadMisses += 1;
    return normalizeShard(record, id);
  }

  function enqueueShardWrite(id, operation) {
    const previous = shardFlights.get(id) || Promise.resolve();
    const current = previous.then(operation, operation);
    shardFlights.set(id, current);
    return current.finally(() => {
      if (shardFlights.get(id) === current) shardFlights.delete(id);
    });
  }

  return {
    kind:'sharded-file',
    durable:true,
    directory:rootDirectory,
    shardPrefixLength,
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
      const groups = new Map();
      for (const cid of blockCids) {
        assertBlockCid(cid);
        metrics.vectorReads += 1;
        const id = shardId(cid);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(cid);
      }
      const result = new Map();
      const grouped = [...groups.entries()];
      await mapLimit(grouped, ioConcurrency, async ([id, cids]) => {
        const shard = await loadShard(id);
        for (const cid of cids) {
          const vector = shard.vectors[cid];
          if (!vector) continue;
          assertVector(vector);
          metrics.vectorHits += 1;
          result.set(cid, [...vector]);
        }
      });
      return result;
    },
    async saveVectors(entries) {
      const normalized = normalizeVectorEntries(entries);
      const groups = new Map();
      for (const entry of normalized) {
        const id = shardId(entry.cid);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(entry);
      }
      const grouped = [...groups.entries()];
      await mapLimit(grouped, ioConcurrency, async ([id, additions]) => enqueueShardWrite(id, async () => {
        const shard = await loadShard(id);
        let changed = false;
        for (const { cid, vector } of additions) {
          if (shard.vectors[cid]) {
            assertVector(shard.vectors[cid]);
            continue;
          }
          shard.vectors[cid] = vector;
          metrics.vectorWrites += 1;
          changed = true;
        }
        if (changed) {
          await atomicWrite(shardPath(id), shard);
          metrics.shardWrites += 1;
        }
      }));
    },
    stats() {
      return {
        ...metrics,
        kind:'sharded-file',
        durable:true,
        directory:rootDirectory,
        shardPrefixLength,
        activeShardWrites:shardFlights.size
      };
    }
  };
}
