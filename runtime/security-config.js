import { createProviderAccessPolicy } from '../core/security/provider-access.js';

export function createRuntimeProviderAccessPolicy(env = process.env) {
  const requestedMode = String(env.TRUYN_PROVIDER_ACCESS_MODE || 'owner-only').trim().toLowerCase();
  const publicOptIn = String(env.TRUYN_ALLOW_PUBLIC_PROVIDER || '').trim() === '1';

  if (requestedMode === 'public' && !publicOptIn) {
    throw new Error('Public provider mode requires explicit TRUYN_ALLOW_PUBLIC_PROVIDER=1 opt-in');
  }

  return createProviderAccessPolicy({
    mode: requestedMode,
    allowedRequesterIds: env.TRUYN_ALLOWED_REQUESTER_IDS || ''
  });
}
