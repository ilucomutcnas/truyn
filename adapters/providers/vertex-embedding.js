async function googleMetadataAccessToken({ fetchImpl = fetch } = {}) {
  const host = process.env.GCE_METADATA_HOST || 'metadata.google.internal';
  const response = await fetchImpl(`http://${host}/computeMetadata/v1/instance/service-accounts/default/token`, {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error_description || body?.error || `Google metadata HTTP ${response.status}`);
  }
  return body.access_token;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePrediction(prediction) {
  const values = prediction?.embeddings?.values;
  if (!Array.isArray(values) || values.length === 0) throw new Error('Vertex embedding response did not contain values');
  return values;
}

export function createVertexEmbeddingClient({
  projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  location = process.env.VERTEX_EMBEDDING_LOCATION || 'us-central1',
  model = process.env.VERTEX_EMBEDDING_MODEL || 'text-multilingual-embedding-002',
  endpoint = process.env.VERTEX_API_ENDPOINT || 'https://aiplatform.googleapis.com',
  accessTokenProvider = googleMetadataAccessToken,
  batchSize = Number(process.env.VERTEX_EMBEDDING_BATCH_SIZE || 5),
  outputDimensionality = process.env.VERTEX_EMBEDDING_DIMENSIONS ? Number(process.env.VERTEX_EMBEDDING_DIMENSIONS) : null,
  maxRetries = Number(process.env.VERTEX_EMBEDDING_RETRIES || 6),
  fetchImpl = fetch
} = {}) {
  if (!projectId) throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required');
  if (!location) throw new Error('Vertex embedding location is required');
  if (!model) throw new Error('Vertex embedding model is required');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5) throw new Error('Vertex embedding batchSize must be 1..5');
  if (outputDimensionality != null && (!Number.isInteger(outputDimensionality) || outputDimensionality < 1)) {
    throw new Error('Vertex embedding outputDimensionality must be a positive integer');
  }

  const metrics = {
    requests: 0,
    inputs: 0,
    retries: 0,
    requestBytes: 0,
    responseBytes: 0,
    providerLatencyMs: 0
  };

  async function predict(instances) {
    const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
    const bodyObject = {
      instances,
      parameters: {
        autoTruncate: true,
        ...(outputDimensionality == null ? {} : { outputDimensionality })
      }
    };
    const requestBody = JSON.stringify(bodyObject);

    for (let attempt = 0; ; attempt += 1) {
      const token = await accessTokenProvider({ fetchImpl });
      const startedAt = Date.now();
      const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/v1/${modelPath}:predict`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: requestBody
      });
      const text = await response.text();
      metrics.requests += 1;
      metrics.requestBytes += Buffer.byteLength(requestBody);
      metrics.responseBytes += Buffer.byteLength(text);
      metrics.providerLatencyMs += Date.now() - startedAt;
      let body;
      try { body = JSON.parse(text); } catch { body = null; }
      if (response.ok) {
        const predictions = body?.predictions || [];
        if (predictions.length !== instances.length) throw new Error(`Vertex embedding returned ${predictions.length} predictions for ${instances.length} inputs`);
        return predictions.map(normalizePrediction);
      }
      const message = body?.error?.message || `Vertex embedding HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxRetries) throw new Error(message);
      metrics.retries += 1;
      await sleep(Math.min(15_000, 500 * (2 ** attempt)));
    }
  }

  async function embedMany(texts, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
    if (!Array.isArray(texts) || texts.length === 0 || texts.some((text) => typeof text !== 'string' || !text.trim())) {
      throw new Error('Vertex embedding texts must be a non-empty array of strings');
    }
    const vectors = [];
    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);
      const predictions = await predict(batch.map((content) => ({ task_type: taskType, content })));
      vectors.push(...predictions);
      metrics.inputs += batch.length;
    }
    return vectors;
  }

  return {
    name: 'vertex-text-embedding',
    model,
    location,
    embedMany,
    stats: () => ({ ...metrics, model, location })
  };
}
