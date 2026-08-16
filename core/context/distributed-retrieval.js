import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import {
  contextQueryHash,
  retrieveContextBlocks,
  verifyContextManifest,
  verifyContextSelection
} from './index.js';

export const DISTRIBUTED_RETRIEVAL_VERSION = 1;
export const DISTRIBUTED_DISCOVERY_PROTOCOL = 'truyn-distributed-context-v1';

const hashHex = (value) => createHash('sha256').update(String(value)).digest('hex');
const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value));

export function distributedDiscoveryCapability(rootCid) {
  if (typeof rootCid !== 'string' || !rootCid.startsWith('truyn:ctx:')) throw new Error('distributed root CID is required');
  return `context.distributed.${hashHex(rootCid).slice(0, 32)}`;
}

export function distributedRequestCapability(rootCid, holderNodeId, partitionIndex) {
  if (typeof holderNodeId !== 'string' || holderNodeId.length === 0) throw new Error('distributed holder node ID is required');
  if (!Number.isInteger(partitionIndex) || partitionIndex < 0) throw new Error('distributed partition index is required');
  return `${distributedDiscoveryCapability(rootCid)}.${partitionIndex}.${hashHex(holderNodeId).slice(0, 16)}`;
}

export function distributedPartitionForBlockCid(blockCid, partitionCount) {
  if (typeof blockCid !== 'string' || !blockCid.startsWith('truyn:ctxb:')) throw new Error('distributed block CID is required');
  if (!Number.isInteger(partitionCount) || partitionCount < 1 || partitionCount > 4096) throw new Error('distributed partition count must be 1..4096');
  const hex = blockCid.slice('truyn:ctxb:'.length, 'truyn:ctxb:'.length + 12);
  const value = Number.parseInt(hex, 16);
  if (!Number.isSafeInteger(value)) throw new Error('invalid distributed block CID');
  return value % partitionCount;
}

export function expectedManifestPartition(manifest, partitionIndex, partitionCount) {
  const verification = verifyContextManifest(manifest, manifest?.cid);
  if (!verification.ok) throw new Error(`distributed manifest verification failed: ${verification.reason}`);
  if (!Number.isInteger(partitionIndex) || partitionIndex < 0 || partitionIndex >= partitionCount) throw new Error('invalid distributed partition index');
  return manifest.blocks.filter((block) => distributedPartitionForBlockCid(block.cid, partitionCount) === partitionIndex);
}

export function validateHolderPartition({ manifest, blocks, partitionIndex, partitionCount }) {
  const selection = verifyContextSelection(manifest, blocks, manifest?.cid);
  if (!selection.ok) throw new Error(`distributed holder partition verification failed: ${selection.reason}`);
  const expected = expectedManifestPartition(manifest, partitionIndex, partitionCount);
  const expectedCids = new Set(expected.map((block) => block.cid));
  const actualCids = new Set((blocks || []).map((block) => block.cid));
  if (expectedCids.size !== actualCids.size) throw new Error('distributed holder partition is incomplete');
  for (const cid of expectedCids) if (!actualCids.has(cid)) throw new Error('distributed holder partition is incomplete');
  for (const block of blocks || []) {
    if (distributedPartitionForBlockCid(block.cid, partitionCount) !== partitionIndex) {
      throw new Error('distributed holder contains a block outside its partition');
    }
  }
  return { ok:true, blockCount:actualCids.size };
}

export function distributedOfferMetadata({ rootCid, holderNodeId, partitionIndex, partitionCount, requestCapability, blockCount }) {
  return {
    protocol:DISTRIBUTED_DISCOVERY_PROTOCOL,
    version:DISTRIBUTED_RETRIEVAL_VERSION,
    role:'context-partition-holder',
    rootCid,
    holderNodeId,
    partitionIndex,
    partitionCount,
    requestCapability,
    blockCount
  };
}

function parseDistributedOffer(offer, rootCid) {
  const metadata = offer?.payload?.metadata?.distributedContext;
  if (!metadata || metadata.protocol !== DISTRIBUTED_DISCOVERY_PROTOCOL || metadata.version !== DISTRIBUTED_RETRIEVAL_VERSION) return null;
  if (metadata.rootCid !== rootCid || metadata.holderNodeId !== offer.from) return null;
  if (!Number.isInteger(metadata.partitionCount) || metadata.partitionCount < 1 || metadata.partitionCount > 4096) return null;
  if (!Number.isInteger(metadata.partitionIndex) || metadata.partitionIndex < 0 || metadata.partitionIndex >= metadata.partitionCount) return null;
  if (typeof metadata.requestCapability !== 'string' || metadata.requestCapability.length === 0) return null;
  if (metadata.requestCapability !== distributedRequestCapability(rootCid, offer.from, metadata.partitionIndex)) return null;
  return {
    nodeId:offer.from,
    publicKey:offer.publicKey,
    trust:offer.trust || null,
    partitionIndex:metadata.partitionIndex,
    partitionCount:metadata.partitionCount,
    requestCapability:metadata.requestCapability,
    blockCount:Number.isInteger(metadata.blockCount) ? metadata.blockCount : null,
    offer
  };
}

export function resolveDistributedCoverage(manifest, offers, rootCid = manifest?.cid) {
  const verification = verifyContextManifest(manifest, rootCid);
  if (!verification.ok) throw new Error(`distributed manifest verification failed: ${verification.reason}`);
  const parsed = (offers || []).map((offer) => parseDistributedOffer(offer, rootCid)).filter(Boolean);
  if (parsed.length === 0) {
    const error = new Error('distributed_context_no_authorized_holders');
    error.code = 'distributed_context_no_authorized_holders';
    throw error;
  }
  const partitionCounts = [...new Set(parsed.map((holder) => holder.partitionCount))];
  if (partitionCounts.length !== 1) throw new Error('distributed_context_partition_contract_mismatch');
  const partitionCount = partitionCounts[0];
  const byPartition = new Map();
  for (const holder of parsed) {
    if (!byPartition.has(holder.partitionIndex)) byPartition.set(holder.partitionIndex, []);
    byPartition.get(holder.partitionIndex).push(holder);
  }
  const missingPartitions = [];
  for (let index = 0; index < partitionCount; index += 1) if (!byPartition.has(index)) missingPartitions.push(index);
  if (missingPartitions.length > 0) {
    const error = new Error('distributed_context_incomplete_coverage');
    error.code = 'distributed_context_incomplete_coverage';
    error.missingPartitions = missingPartitions;
    throw error;
  }
  const selected = [];
  for (let index = 0; index < partitionCount; index += 1) {
    const candidates = [...byPartition.get(index)].sort((left, right) => {
      const leftTrust = Number(left.trust?.score || 0);
      const rightTrust = Number(right.trust?.score || 0);
      return rightTrust - leftTrust || left.nodeId.localeCompare(right.nodeId);
    });
    selected.push(candidates[0]);
  }
  const expectedCounts = selected.map((holder) => expectedManifestPartition(manifest, holder.partitionIndex, partitionCount).length);
  for (let index = 0; index < selected.length; index += 1) {
    if (selected[index].blockCount != null && selected[index].blockCount !== expectedCounts[index]) {
      throw new Error('distributed_context_holder_count_mismatch');
    }
  }
  return {
    ok:true,
    partitionCount,
    authorizedHolderOffers:parsed.length,
    selectedHolders:selected,
    replicas:parsed.length - partitionCount,
    manifestBlocks:manifest.blocks.length
  };
}

export function createDistributedHolderReceipt({ identity, rootCid, queryHash, block, partitionIndex, partitionCount, localRank }) {
  if (!identity?.nodeId || !identity?.privateKeyPem) throw new Error('distributed holder identity is required');
  const payload = {
    version:DISTRIBUTED_RETRIEVAL_VERSION,
    protocol:DISTRIBUTED_DISCOVERY_PROTOCOL,
    rootCid,
    queryHash,
    holderNodeId:identity.nodeId,
    partitionIndex,
    partitionCount,
    blockId:block.id,
    blockCid:block.cid,
    bytes:block.bytes ?? Buffer.byteLength(block.text || ''),
    localRank
  };
  return { payload, signature:signValue(payload, identity.privateKeyPem) };
}

export function verifyDistributedCandidate({ manifest, rootCid, queryHash, holder, candidate, publicKeyPem }) {
  if (!candidate?.receipt?.payload || typeof candidate.receipt.signature !== 'string') {
    return { ok:false, reason:'distributed_candidate_receipt_missing' };
  }
  const selection = verifyContextSelection(manifest, [candidate], rootCid);
  if (!selection.ok) return { ok:false, reason:selection.reason };
  if (distributedPartitionForBlockCid(candidate.cid, holder.partitionCount) !== holder.partitionIndex) {
    return { ok:false, reason:'distributed_candidate_wrong_partition' };
  }
  const payload = candidate.receipt.payload;
  const expected = {
    version:DISTRIBUTED_RETRIEVAL_VERSION,
    protocol:DISTRIBUTED_DISCOVERY_PROTOCOL,
    rootCid,
    queryHash,
    holderNodeId:holder.nodeId,
    partitionIndex:holder.partitionIndex,
    partitionCount:holder.partitionCount,
    blockId:candidate.id,
    blockCid:candidate.cid,
    bytes:candidate.bytes ?? Buffer.byteLength(candidate.text || ''),
    localRank:candidate.localRank
  };
  if (JSON.stringify(payload) !== JSON.stringify(expected)) return { ok:false, reason:'distributed_candidate_receipt_payload_mismatch' };
  if (!verifyValue(payload, candidate.receipt.signature, publicKeyPem)) return { ok:false, reason:'distributed_candidate_receipt_signature_invalid' };
  return { ok:true };
}

export function defaultDistributedCandidateSelector(query, candidates, { topK = 1 } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('distributed retrieval produced no candidates');
  const selected = retrieveContextBlocks(candidates.map(({ id, text }) => ({ id, text })), query, { topK }).blocks;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return selected.map((item) => byId.get(item.id)).filter(Boolean);
}

export function distributedReceiptDigest(receipt) {
  return `sha256:${hashHex(JSON.stringify(receipt))}`;
}

export function distributedContentCommitment(blockCid) {
  return `sha256:${hashHex(blockCid)}`;
}

export function distributedPublicResult({ rootCid, query, selected, coverage, candidateCount, networkBytes }) {
  const queryHash = contextQueryHash(query);
  return {
    context:selected.map((candidate) => candidate.text).join('\n\n'),
    provenance:{
      version:DISTRIBUTED_RETRIEVAL_VERSION,
      protocol:DISTRIBUTED_DISCOVERY_PROTOCOL,
      rootCid,
      manifestCid:rootCid,
      queryHash,
      verified:true,
      partitionCount:coverage.partitionCount,
      authorizedHolderOffers:coverage.authorizedHolderOffers,
      queriedHolders:coverage.selectedHolders.length,
      networkCandidateCount:candidateCount,
      networkBytes,
      selected:selected.map((candidate) => ({
        holderNodeId:candidate.holderNodeId,
        partitionIndex:candidate.partitionIndex,
        contentCommitment:distributedContentCommitment(candidate.cid),
        holderReceiptDigest:distributedReceiptDigest(candidate.receipt)
      }))
    }
  };
}

export function distributedPayloadBytes(value) {
  return jsonBytes(value);
}
