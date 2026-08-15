function list(value = '') {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function createRuntimeBackchannelConfig(env = process.env) {
  const protectedProviderNodeIds = list(env.TRUYN_PROTECTED_PROVIDER_NODE_IDS);
  const providerBackchannelToken = String(env.TRUYN_PROVIDER_BACKCHANNEL_TOKEN || '').trim();

  if (protectedProviderNodeIds.length > 0 && !providerBackchannelToken) {
    throw new Error('TRUYN_PROTECTED_PROVIDER_NODE_IDS requires TRUYN_PROVIDER_BACKCHANNEL_TOKEN');
  }
  if (protectedProviderNodeIds.length === 0 && providerBackchannelToken && String(env.TRUYN_ROLE || '').trim() === 'relay') {
    throw new Error('Relay TRUYN_PROVIDER_BACKCHANNEL_TOKEN requires TRUYN_PROTECTED_PROVIDER_NODE_IDS');
  }

  return {
    protectedProviderNodeIds,
    providerBackchannelToken: providerBackchannelToken || null
  };
}
