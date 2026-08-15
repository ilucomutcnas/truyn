export async function googleMetadataAccessToken({ fetchImpl = fetch } = {}) {
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

export async function googleProviderHeaders({ accessTokenProvider = googleMetadataAccessToken, fetchImpl = fetch } = {}) {
  return {
    authorization: `Bearer ${await accessTokenProvider({ fetchImpl })}`,
    'content-type': 'application/json'
  };
}
