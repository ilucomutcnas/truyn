const SUPPORTED = new Set(['openai', 'openai-compatible', 'local', 'anthropic', 'azure-openai', 'vertex-gemini', 'custom-http', 'custom-mcp']);

function listCapabilities(value) {
  const values = Array.isArray(value) ? value : String(value || 'reasoning.general').split(',');
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

export function createByokProfile({
  provider,
  model = null,
  baseUrl = null,
  endpoint = null,
  tool = null,
  projectId = null,
  location = null,
  credentialEnv = null,
  capabilities = ['reasoning.general'],
  requesterNodeId,
  providerNodeId,
  verifiedAt = null,
  noAuth = false
} = {}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!SUPPORTED.has(normalizedProvider)) {
    throw new Error(`Unsupported BYOK profile provider: ${provider}. Supported: ${[...SUPPORTED].join(', ')}`);
  }
  if (!requesterNodeId || !providerNodeId) throw new Error('requesterNodeId and providerNodeId are required');
  if (requesterNodeId === providerNodeId) throw new Error('BYOK provider identity must be separate from requester identity');

  const adapterProvider = ['openai-compatible', 'local'].includes(normalizedProvider)
    ? 'openai'
    : normalizedProvider === 'custom-mcp'
      ? 'mcp-http-tool'
      : normalizedProvider;
  const authMode = normalizedProvider === 'local'
    ? 'none'
    : ['custom-http', 'custom-mcp'].includes(normalizedProvider)
      ? (credentialEnv && !noAuth ? 'bearer' : 'none')
      : normalizedProvider === 'openai-compatible'
        ? (noAuth ? 'none' : 'bearer')
        : normalizedProvider === 'vertex-gemini'
          ? 'runtime-identity'
          : normalizedProvider === 'azure-openai'
            ? 'api-key-or-managed-identity'
            : 'bearer';
  const resolvedCredentialEnv = authMode === 'none' || authMode === 'runtime-identity'
    ? null
    : credentialEnv || defaultCredentialEnv(normalizedProvider);

  const profile = {
    schema: 1,
    provider: normalizedProvider,
    adapterProvider,
    model: model || null,
    baseUrl: baseUrl || null,
    endpoint: endpoint || null,
    tool: tool || null,
    projectId: projectId || null,
    location: location || null,
    credentialEnv: resolvedCredentialEnv,
    authMode,
    capabilities: listCapabilities(capabilities),
    accessMode: 'owner-only',
    billingMode: 'byok',
    requesterNodeId,
    providerNodeId,
    verifiedAt: verifiedAt || null
  };

  if (['openai', 'openai-compatible', 'local', 'anthropic', 'azure-openai'].includes(normalizedProvider) && !profile.model) {
    throw new Error(`${normalizedProvider} BYOK profile requires --model`);
  }
  if (['openai-compatible', 'local'].includes(normalizedProvider) && !profile.baseUrl) {
    throw new Error(`${normalizedProvider} BYOK profile requires --base-url`);
  }
  if (normalizedProvider === 'azure-openai' && !profile.endpoint) {
    throw new Error('azure-openai BYOK profile requires --endpoint');
  }
  if (normalizedProvider === 'vertex-gemini' && !profile.projectId) {
    throw new Error('vertex-gemini BYOK profile requires --project-id');
  }
  if (normalizedProvider === 'custom-http' && !profile.endpoint) {
    throw new Error('custom-http BYOK profile requires --endpoint');
  }
  if (normalizedProvider === 'custom-mcp') {
    if (!profile.endpoint) throw new Error('custom-mcp BYOK profile requires --endpoint');
    if (!profile.tool) throw new Error('custom-mcp BYOK profile requires --tool');
  }
  return profile;
}

function defaultCredentialEnv(provider) {
  if (provider === 'openai' || provider === 'openai-compatible') return 'OPENAI_API_KEY';
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (provider === 'azure-openai') return 'AZURE_OPENAI_API_KEY';
  return null;
}

export function providerAdapterOptions(profile, env = process.env) {
  const capabilities = listCapabilities(profile?.capabilities);
  if (profile.provider === 'openai' || profile.provider === 'openai-compatible' || profile.provider === 'local') {
    return {
      capabilities,
      apiKey: profile.credentialEnv ? env[profile.credentialEnv] : undefined,
      model: profile.model,
      baseUrl: profile.baseUrl || undefined,
      allowNoAuth: profile.authMode === 'none'
    };
  }
  if (profile.provider === 'anthropic') {
    return {
      capabilities,
      apiKey: profile.credentialEnv ? env[profile.credentialEnv] : undefined,
      model: profile.model,
      baseUrl: profile.baseUrl || undefined
    };
  }
  if (profile.provider === 'azure-openai') {
    return {
      capabilities,
      apiKey: profile.credentialEnv ? env[profile.credentialEnv] : undefined,
      model: profile.model,
      endpoint: profile.endpoint
    };
  }
  if (profile.provider === 'vertex-gemini') {
    return {
      capabilities,
      projectId: profile.projectId,
      location: profile.location || 'global',
      model: profile.model || undefined
    };
  }
  if (profile.provider === 'custom-http') {
    return {
      capabilities,
      endpoint: profile.endpoint,
      authMode: profile.authMode,
      apiKey: profile.credentialEnv ? env[profile.credentialEnv] : undefined
    };
  }
  if (profile.provider === 'custom-mcp') {
    return {
      capabilities,
      endpoint: profile.endpoint,
      tool: profile.tool,
      authMode: profile.authMode,
      apiKey: profile.credentialEnv ? env[profile.credentialEnv] : undefined
    };
  }
  throw new Error(`Unsupported BYOK profile provider: ${profile?.provider}`);
}

export function validateByokEnvironment(profile, env = process.env) {
  const missing = [];
  if (profile.authMode === 'bearer') {
    if (!profile.credentialEnv || !env[profile.credentialEnv]) missing.push(profile.credentialEnv || 'credential env');
  }
  if (profile.provider === 'azure-openai') {
    const hasApiKey = Boolean(profile.credentialEnv && env[profile.credentialEnv]);
    const hasManagedIdentity = Boolean(env.IDENTITY_ENDPOINT && env.IDENTITY_HEADER);
    if (!hasApiKey && !hasManagedIdentity) missing.push(profile.credentialEnv || 'AZURE_OPENAI_API_KEY', 'or Azure managed identity');
  }
  return { ok: missing.length === 0, missing };
}

export function markByokVerified(profile, when = new Date()) {
  return { ...profile, verifiedAt: when.toISOString() };
}

export function assertVerifiedByokProfile(profile, requesterNodeId) {
  if (!profile || profile.schema !== 1) throw new Error('BYOK provider is not configured. Run: truyn setup ... --test');
  if (profile.accessMode !== 'owner-only' || profile.billingMode !== 'byok') {
    throw new Error('Configured provider is not a private BYOK provider');
  }
  if (profile.requesterNodeId !== requesterNodeId) throw new Error('BYOK profile belongs to a different requester identity');
  if (!profile.verifiedAt) throw new Error('BYOK provider is not verified. Re-run truyn setup with --test');
  return true;
}

export function isLoopbackRelay(relayUrl) {
  try {
    const host = new URL(relayUrl).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}
