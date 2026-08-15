import { createProviderAccessPolicy } from '../core/security/provider-access.js';

export function createRuntimeProviderAccessPolicy(env = process.env) {
  return createProviderAccessPolicy({
    mode: env.TRUYN_PROVIDER_ACCESS_MODE || 'owner-only',
    allowedRequesterIds: env.TRUYN_ALLOWED_REQUESTER_IDS || ''
  });
}
