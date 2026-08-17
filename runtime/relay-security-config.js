function enabled(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function productionMode(env) {
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  return enabled(env.TRUYN_PRODUCTION) || nodeEnv === 'production' || nodeEnv === 'prod';
}

export function createRuntimeRelaySecurityConfig(env = process.env) {
  const publicNetwork = enabled(env.TRUYN_PUBLIC_NETWORK);
  const registrationRequested = enabled(env.TRUYN_ALLOW_PUBLIC_REGISTRATION);
  const dispatchRequested = enabled(env.TRUYN_ALLOW_PUBLIC_DISPATCH);
  const localDevelopmentMode = enabled(env.TRUYN_LOCAL_DEVELOPMENT_MODE);
  const production = productionMode(env);

  if (!publicNetwork && (registrationRequested || dispatchRequested)) {
    throw new Error('Public relay features require explicit TRUYN_PUBLIC_NETWORK=1 master opt-in');
  }
  if (localDevelopmentMode && (publicNetwork || production)) {
    throw new Error('TRUYN_LOCAL_DEVELOPMENT_MODE cannot be combined with a public network or production runtime');
  }

  return {
    publicNetwork,
    allowPublicRegistration: publicNetwork && registrationRequested,
    allowPublicDispatch: publicNetwork && dispatchRequested,
    localDevelopmentMode,
    productionMode: production
  };
}
