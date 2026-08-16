import { contextQueryHash } from './index.js';

function assertRouter(router) {
  if (!router || typeof router.retrieve !== 'function') throw new Error('single-flight semantic router requires retrieve()');
  for (const method of ['warmContext','warmContexts','invalidateContext','loadManifest','publishContext','prepareContext','stats']) {
    if (typeof router[method] !== 'function') throw new Error(`single-flight semantic router requires ${method}()`);
  }
}

/**
 * Process-local concurrency coordinator for production semantic retrieval.
 *
 * It closes three cache-miss races without changing retrieval semantics:
 *
 * 1. one cold root warm/load flight per root CID;
 * 2. one full retrieval flight per root CID + query + topK;
 * 3. one query-key execution lane across roots so the underlying router's
 *    query projection/embedding cache is populated once before the same query
 *    is evaluated against another root.
 *
 * The third rule deliberately serializes only identical query hashes. Different
 * questions and different roots remain fully concurrent. Reranking is shared
 * only for identical root/query/config tuples because candidate sets differ by
 * root and therefore cannot safely be reused across roots.
 *
 * This is a single-process coordinator. Cross-replica exactly-once work still
 * requires a distributed lease/CAS/idempotency layer in the shared index tier.
 */
export function createSingleFlightSemanticRouter(router) {
  assertRouter(router);

  const warmedRoots = new Set();
  const rootWarmFlights = new Map();
  const retrievalFlights = new Map();
  const queryTails = new Map();
  const metrics = {
    retrievalRequests:0,
    retrievalFlightLeaders:0,
    retrievalFlightFollowers:0,
    rootWarmLeaders:0,
    rootWarmFollowers:0,
    rootWarmCacheHits:0,
    queryLaneLeaders:0,
    queryLaneFollowers:0,
    invalidations:0
  };

  async function ensureRootWarm(cid) {
    if (warmedRoots.has(cid)) {
      metrics.rootWarmCacheHits += 1;
      return { ok:true, cid, alreadyWarm:true };
    }
    if (rootWarmFlights.has(cid)) {
      metrics.rootWarmFollowers += 1;
      return rootWarmFlights.get(cid);
    }

    metrics.rootWarmLeaders += 1;
    const flight = (async () => {
      const result = await router.warmContext(cid);
      warmedRoots.add(cid);
      return result;
    })();
    rootWarmFlights.set(cid, flight);
    try {
      return await flight;
    } finally {
      if (rootWarmFlights.get(cid) === flight) rootWarmFlights.delete(cid);
    }
  }

  async function inQueryLane(query, work) {
    const queryHash = contextQueryHash(query);
    const previous = queryTails.get(queryHash) || null;
    if (previous) metrics.queryLaneFollowers += 1;
    else metrics.queryLaneLeaders += 1;

    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const tail = (previous || Promise.resolve()).then(() => turn);
    queryTails.set(queryHash, tail);
    if (previous) {
      try { await previous; } catch {}
    }

    try {
      return await work();
    } finally {
      release();
      if (queryTails.get(queryHash) === tail) queryTails.delete(queryHash);
    }
  }

  async function retrieve(cid, query, { topK = 1 } = {}) {
    metrics.retrievalRequests += 1;
    const queryHash = contextQueryHash(query);
    const key = `${cid}:${queryHash}:${topK}`;
    if (retrievalFlights.has(key)) {
      metrics.retrievalFlightFollowers += 1;
      return structuredClone(await retrievalFlights.get(key));
    }

    metrics.retrievalFlightLeaders += 1;
    const flight = (async () => {
      await ensureRootWarm(cid);
      return inQueryLane(query, () => router.retrieve(cid, query, { topK }));
    })();
    retrievalFlights.set(key, flight);
    try {
      return structuredClone(await flight);
    } finally {
      if (retrievalFlights.get(key) === flight) retrievalFlights.delete(key);
    }
  }

  async function publishContext(blocks, metadata) {
    const result = await router.publishContext(blocks, metadata);
    if (result?.cid) warmedRoots.add(result.cid);
    return result;
  }

  async function prepareContext(cid) {
    const result = await router.prepareContext(cid);
    if (result?.ok) warmedRoots.add(cid);
    return result;
  }

  async function warmContext(cid) {
    return ensureRootWarm(cid);
  }

  async function warmContexts(cids) {
    if (!Array.isArray(cids)) throw new Error('semantic warmup root CIDs must be an array');
    return Promise.all(cids.map((cid) => ensureRootWarm(cid)));
  }

  async function invalidateContext(cid, options) {
    warmedRoots.delete(cid);
    for (const key of retrievalFlights.keys()) {
      if (key.startsWith(`${cid}:`)) retrievalFlights.delete(key);
    }
    metrics.invalidations += 1;
    return router.invalidateContext(cid, options);
  }

  return {
    name:`singleflight:${router.name || router.algorithm || 'semantic-router'}`,
    algorithm:router.algorithm,
    putContext:typeof router.putContext === 'function' ? router.putContext.bind(router) : undefined,
    publishContext,
    prepareContext,
    warmContext,
    warmContexts,
    invalidateContext,
    manifest:typeof router.manifest === 'function' ? router.manifest.bind(router) : undefined,
    loadManifest:router.loadManifest.bind(router),
    retrieve,
    stats() {
      return {
        ...router.stats(),
        concurrency:{
          ...metrics,
          warmedRoots:warmedRoots.size,
          rootWarmFlights:rootWarmFlights.size,
          retrievalFlights:retrievalFlights.size,
          queryLanes:queryTails.size
        }
      };
    }
  };
}
