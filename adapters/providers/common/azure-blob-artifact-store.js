import { randomUUID } from 'node:crypto';
import { containerAppsManagedIdentityToken } from './azure-auth.js';

function parseRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('azblob://')) throw new Error(`Invalid Azure Blob ref: ${ref}`);
  const rest = ref.slice('azblob://'.length);
  const parts = rest.split('/');
  if (parts.length < 3) throw new Error(`Invalid Azure Blob ref: ${ref}`);
  return { account: parts.shift(), container: parts.shift(), objectName: parts.join('/') };
}

export function createAzureBlobArtifactStore({
  account = process.env.TRUYN_AZURE_ARTIFACT_ACCOUNT,
  container = process.env.TRUYN_AZURE_ARTIFACT_CONTAINER || 'truyn-media',
  accessTokenProvider = containerAppsManagedIdentityToken,
  fetchImpl = fetch
} = {}) {
  if (!account) throw new Error('TRUYN_AZURE_ARTIFACT_ACCOUNT is required');

  async function token() {
    return accessTokenProvider({ fetchImpl, resource: 'https://storage.azure.com/' });
  }

  return {
    account,
    container,
    async put(buffer, { mediaType = 'application/octet-stream', prefix = 'media', extension = 'bin' } = {}) {
      const objectName = `${prefix}/${Date.now()}-${randomUUID()}.${extension}`;
      const url = `https://${account}.blob.core.windows.net/${container}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetchImpl(url, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await token()}`,
          'x-ms-version': '2023-11-03',
          'x-ms-blob-type': 'BlockBlob',
          'content-type': mediaType
        },
        body: buffer
      });
      if (!response.ok) throw new Error(`Azure Blob upload HTTP ${response.status}`);
      return { ref: `azblob://${account}/${container}/${objectName}`, objectName, account, container, bytes: buffer.byteLength };
    },

    async get(ref) {
      const parsed = parseRef(ref);
      const url = `https://${parsed.account}.blob.core.windows.net/${parsed.container}/${parsed.objectName.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${await token()}`, 'x-ms-version': '2023-11-03' }
      });
      if (!response.ok) throw new Error(`Azure Blob download HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }
  };
}
