export async function containerAppsManagedIdentityToken({
  fetchImpl = fetch,
  resource = process.env.AZURE_AI_TOKEN_RESOURCE || 'https://cognitiveservices.azure.com/'
} = {}) {
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
  if (!endpoint || !identityHeader) {
    throw new Error('Azure managed identity is unavailable: IDENTITY_ENDPOINT/IDENTITY_HEADER are missing');
  }

  const url = new URL(endpoint);
  url.searchParams.set('resource', resource);
  url.searchParams.set('api-version', '2019-08-01');
  if (process.env.AZURE_CLIENT_ID) url.searchParams.set('client_id', process.env.AZURE_CLIENT_ID);

  const response = await fetchImpl(url, { headers: { 'x-identity-header': identityHeader } });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error_description || body?.error || `Azure identity HTTP ${response.status}`);
  }
  return body.access_token;
}

export async function azureProviderHeaders({ apiKey, accessTokenProvider = containerAppsManagedIdentityToken, fetchImpl = fetch, resource } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['api-key'] = apiKey;
  else headers.authorization = `Bearer ${await accessTokenProvider({ fetchImpl, resource })}`;
  return headers;
}
