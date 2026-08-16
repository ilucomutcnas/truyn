const encoder = new TextEncoder();
const decoder = new TextDecoder();

function chunkBytes(chunk) {
  if (chunk == null) return new Uint8Array();
  if (chunk instanceof Uint8Array) return chunk;
  if (typeof chunk.subarray === 'function') return chunk.subarray();
  return new Uint8Array(chunk);
}

export async function readJsonStream(stream, { maxBytes = 1_048_576 } = {}) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream.source) {
    const bytes = chunkBytes(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) throw new Error('truyn_stream_message_too_large');
    chunks.push(bytes);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (merged.byteLength === 0) return null;
  return JSON.parse(decoder.decode(merged));
}

export async function writeJsonStream(stream, value) {
  const bytes = encoder.encode(JSON.stringify(value));
  await stream.sink((async function * () { yield bytes; })());
}

export async function requestJson(node, target, protocol, request, { timeoutMs = 5_000, maxBytes = 1_048_576 } = {}) {
  const stream = await node.dialProtocol(target, protocol, { signal: AbortSignal.timeout(timeoutMs) });
  await writeJsonStream(stream, request);
  const response = await readJsonStream(stream, { maxBytes });
  try { await stream.close?.(); } catch {}
  return response;
}
