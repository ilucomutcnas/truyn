function enabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function enforceOwnerProviderRuntimeLock(env = process.env, { accessPolicy, billingPolicy } = {}) {
  const ownerProvider = enabled(env.TRUYN_OWNER_PROVIDER);
  const externalPaidAccess = enabled(env.OWNER_PAID_EXTERNAL_ACCESS);
  const networkVisibility = enabled(env.OWNER_PROVIDER_NETWORK_VISIBILITY);

  if (!ownerProvider) {
    if (externalPaidAccess || networkVisibility) {
      throw new Error('Owner-provider kill switches require explicit TRUYN_OWNER_PROVIDER=1');
    }
    return {
      ownerProvider: false,
      ownerPaidExternalAccess: false,
      ownerProviderNetworkVisibility: false
    };
  }

  if (externalPaidAccess) {
    throw new Error('OWNER_PAID_EXTERNAL_ACCESS must remain disabled until an explicit sponsored entitlement path exists');
  }
  if (networkVisibility) {
    throw new Error('OWNER_PROVIDER_NETWORK_VISIBILITY must remain disabled for owner-funded runtimes');
  }
  if (!accessPolicy || accessPolicy.mode !== 'owner-only') {
    throw new Error('Owner provider runtime requires owner-only access policy');
  }
  if (!billingPolicy || billingPolicy.mode !== 'owner-funded') {
    throw new Error('Owner provider runtime requires owner-funded billing policy');
  }

  return {
    ownerProvider: true,
    ownerPaidExternalAccess: false,
    ownerProviderNetworkVisibility: false
  };
}
