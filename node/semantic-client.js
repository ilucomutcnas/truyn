import { TruynNode } from './client.js';
import { contextQueryHash, verifyContextSelection } from '../core/context/index.js';

const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value));

/**
 * TruynNode variant that resolves $context references through a semantic
 * context router while using the normal relay for identity, discovery, NEED
 * and RESULT traffic. This keeps provider handoff transport unchanged and
 * makes semantic context routing independently replaceable/testable.
 */
export class SemanticTruynNode extends TruynNode {
  constructor({ semanticRouter, retrievalLog = [], ...options } = {}) {
    super(options);
    if (!semanticRouter || typeof semanticRouter.retrieve !== 'function' || typeof semanticRouter.manifest !== 'function') {
      throw new Error('SemanticTruynNode requires semanticRouter');
    }
    this.semanticRouter = semanticRouter;
    this.retrievalLog = retrievalLog;
  }

  async retrieveContext(cid, query, { topK = 1 } = {}) {
    const manifest = this.semanticRouter.manifest(cid);
    const result = await this.semanticRouter.retrieve(cid, query, { topK });
    const verification = verifyContextSelection(manifest, result.blocks, cid);
    if (!verification.ok) throw new Error(`Context retrieval verification failed: ${verification.reason}`);

    const retrieval = result.retrieval || {};
    if (retrieval.rootCid !== cid || retrieval.manifestCid !== cid) throw new Error('Context retrieval provenance root mismatch');
    if (retrieval.queryHash !== contextQueryHash(query)) throw new Error('Context retrieval query hash mismatch');
    const proof = Array.isArray(retrieval.selected) ? retrieval.selected : [];
    if (proof.length !== (result.blocks || []).length) throw new Error('Context retrieval provenance selection mismatch');
    for (let index = 0; index < proof.length; index += 1) {
      const block = result.blocks[index];
      if (proof[index].id !== block.id || proof[index].cid !== block.cid || proof[index].rank !== index + 1) {
        throw new Error('Context retrieval provenance block mismatch');
      }
    }

    const selectedContentBytes = (result.blocks || []).reduce((sum, block) => sum + Buffer.byteLength(block.text || ''), 0);
    const requestBody = { query, topK };
    const responseBody = { cid, blocks: result.blocks, retrieval };
    const retrievalTransferBytes = jsonBytes(requestBody) + jsonBytes(responseBody);
    const logEntry = {
      at: new Date().toISOString(),
      cid,
      queryHash: retrieval.queryHash,
      algorithm: retrieval.algorithm,
      topK,
      corpusBlocks: retrieval.corpusBlocks,
      selected: proof.map((item) => ({ ...item })),
      provenanceVerified: true,
      selectedContentBytes
    };
    this.retrievalLog.push(logEntry);

    return {
      cid,
      blocks: result.blocks,
      retrieval,
      provenanceVerified: true,
      manifestCacheHit: true,
      manifestTransferBytes: 0,
      retrievalTransferBytes,
      transferBytes: retrievalTransferBytes,
      selectedContentBytes
    };
  }
}
