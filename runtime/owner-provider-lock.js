function enabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function positiveInteger(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function enforceOwnerProviderRuntimeLock(env = process.env, { accessPolicy, billingPolicy } = {}) {
  const ownerProvider = enabled(env.TRUYN_OWNER_PROVIDER);
  const externalPaidAccess = enabled(env.OWNER_PAID_EXTERNAL_ACCESS);
  const networkVisibility = enabled(env.OWNER_PROVIDER_NETWORK_VISIBILITY);
  const ownerBudgetConfigured = env.OWNER_AI_DAILY_REQUEST_LIMIT !== undefined
    && String(env.OWNER_AI_DAILY_REQUEST_LIMIT).trim() !== '';
  const dailyRequestLimit = positiveInteger(env.OWNER_AI_DAILY_REQUEST_LIMIT);

  if (!ownerProvider) {
    if (externalPaidAccess || networkVisibility || ownerBudgetConfigured) {
      throw new Error('Owner-provider controls require explicit TRUYN_OWNER_PROVIDER=1');
    }
    return {
      ownerProvider: false,
      ownerPaidExternalAccess: false,
      ownerProviderNetworkVisibility: false,
      ownerDailyRequestLimit: null
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
  if (!dailyRequestLimit) {
    throw new Error('Owner provider runtime requires positive OWNER_AI_DAILY_REQUEST_LIMIT');
  }
  if (billingPolicy.ownerDailyRequestLimit !== dailyRequestLimit) {
    throw new Error('Owner provider runtime daily request budget is not bound to billing policy');
  }

  return {
    ownerProvider: true,
    ownerPaidExternalAccess: false,
    ownerProviderNetworkVisibility: false,
    ownerDailyRequestLimit: dailyRequestLimit
  };
}
