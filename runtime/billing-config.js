import { createProviderBillingPolicy } from '../core/security/provider-billing.js';

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true' || String(value || '').trim() === '1';
}

export function createRuntimeProviderBillingPolicy(env = process.env) {
  return createProviderBillingPolicy({
    mode: env.TRUYN_PROVIDER_BILLING_MODE || 'owner-funded',
    sponsoredAccess: enabled(env.TRUYN_SPONSORED_ACCESS),
    freeDailyRequests: env.TRUYN_FREE_DAILY_REQUESTS || 0,
    freeDailyTokens: env.TRUYN_FREE_DAILY_TOKENS || 0
  });
}
