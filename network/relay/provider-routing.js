function capabilityName(envelope) {
  return envelope?.payload?.capability?.name || null;
}

export function filterAuthorizedOffers({ offers = [], requesterNodeId, capability, ownershipRegistry } = {}) {
  if (!ownershipRegistry) throw new Error('ownershipRegistry is required');
  if (!requesterNodeId) return [];

  const eligible = [];
  for (const offer of offers) {
    const envelope = offer?.envelope || offer;
    if (!envelope?.from) continue;
    if (capability && capabilityName(envelope) !== capability) continue;

    let providerPolicy;
    try {
      providerPolicy = ownershipRegistry.resolveProviderPolicy(envelope);
    } catch {
      continue;
    }

    const decision = ownershipRegistry.authorizeProvider({ requesterNodeId, providerPolicy });
    if (!decision.ok) continue;

    eligible.push({
      ...offer,
      providerPolicy,
      authorization: decision
    });
  }
  return eligible;
}

export function selectAuthorizedOffer(options = {}) {
  return filterAuthorizedOffers(options)[0] || null;
}
