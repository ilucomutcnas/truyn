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
  for await (const chunk of stream) {
    const bytes = chunkBytes(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) {
      stream.abort?.(new Error('truyn_stream_message_too_large'));
      throw new Error('truyn_stream_message_too_large');
    }
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

export async function writeJsonStream(stream, value, { timeoutMs = 5_000 } = {}) {
  const bytes = encoder.encode(JSON.stringify(value));
  const accepted = stream.send(bytes);
  if (!accepted) await stream.onDrain({ signal: AbortSignal.timeout(timeoutMs) });
  // TRUYN's v2 trust RPCs are one JSON message per direction. Half-close the
  // local writable side after the message so the remote async iterator gets EOF,
  // while the readable side remains open for the response.
  await stream.close({ signal: AbortSignal.timeout(timeoutMs) });
}

export async function requestJson(node, target, protocol, request, { timeoutMs = 5_000, maxBytes = 1_048_576 } = {}) {
  const controller = new AbortController();
  let stream = null;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`truyn_json_rpc_timeout:${protocol}`);
      error.code = 'ERR_TRUYN_STREAM_TIMEOUT';
      controller.abort(error);
      stream?.abort?.(error);
      reject(error);
    }, Math.max(1, timeoutMs));
    timer.unref?.();
  });

  const operation = (async () => {
    stream = await node.dialProtocol(target, protocol, { signal: controller.signal });
    await writeJsonStream(stream, request, { timeoutMs });
    return readJsonStream(stream, { maxBytes });
  })();

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
    if (controller.signal.aborted && stream?.status !== 'closed') {
      stream?.abort?.(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('truyn_json_rpc_aborted'));
    }
  }
}
