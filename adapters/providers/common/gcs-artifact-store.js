import { randomUUID } from 'node:crypto';
import { googleMetadataAccessToken } from './google-auth.js';

export function createGcsArtifactStore({
  bucket = process.env.TRUYN_GCS_ARTIFACT_BUCKET,
  accessTokenProvider = googleMetadataAccessToken,
  fetchImpl = fetch
} = {}) {
  if (!bucket) throw new Error('TRUYN_GCS_ARTIFACT_BUCKET is required');

  return {
    async put(buffer, { mediaType = 'application/octet-stream', prefix = 'media', extension = 'bin' } = {}) {
      const objectName = `${prefix}/${Date.now()}-${randomUUID()}.${extension}`;
      const token = await accessTokenProvider({ fetchImpl });
      const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
      url.searchParams.set('uploadType', 'media');
      url.searchParams.set('name', objectName);
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': mediaType
        },
        body: buffer
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `GCS upload HTTP ${response.status}`);
      return { ref: `gs://${bucket}/${objectName}`, objectName, bucket };
    }
  };
}
