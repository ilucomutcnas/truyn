import { createHash, randomUUID } from 'node:crypto';

export function artifactFromBuffer(buffer, { mediaType, provenance = {}, ref = null, metadata = {} } = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  return {
    id: `art_${randomUUID()}`,
    mediaType,
    bytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    ref,
    provenance,
    metadata
  };
}

export function artifactFromBase64(base64, options = {}) {
  return artifactFromBuffer(Buffer.from(base64, 'base64'), options);
}

export function artifactResult(artifacts, metadata = {}) {
  return {
    output: { type: 'artifact', artifacts },
    metadata
  };
}
