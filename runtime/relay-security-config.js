function enabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function createRuntimeRelaySecurityConfig(env = process.env) {
  const publicNetwork = enabled(env.TRUYN_PUBLIC_NETWORK);
  const registrationRequested = enabled(env.TRUYN_ALLOW_PUBLIC_REGISTRATION);
  const dispatchRequested = enabled(env.TRUYN_ALLOW_PUBLIC_DISPATCH);

  if (!publicNetwork && (registrationRequested || dispatchRequested)) {
    throw new Error('Public relay features require explicit TRUYN_PUBLIC_NETWORK=1 master opt-in');
  }

  return {
    publicNetwork,
    allowPublicRegistration: publicNetwork && registrationRequested,
    allowPublicDispatch: publicNetwork && dispatchRequested
  };
}
