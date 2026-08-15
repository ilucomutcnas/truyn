const BILLING_MODES = new Set(['byok', 'owner-funded', 'sponsored', 'prepaid', 'subscription']);
const RECEIPT_STATUSES = new Set(['authorized', 'denied', 'success', 'failed']);

function requiredString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function optionalNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeUsage(usage = {}) {
  const inputTokens = optionalNonNegativeInteger(usage.inputTokens);
  const outputTokens = optionalNonNegativeInteger(usage.outputTokens);
  const explicitTotal = optionalNonNegativeInteger(usage.totalTokens);
  const computedTotal = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;

  return Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal ?? computedTotal,
    estimatedTokens: optionalNonNegativeInteger(usage.estimatedTokens),
    reservedTokens: optionalNonNegativeInteger(usage.reservedTokens),
    requestBytes: optionalNonNegativeInteger(usage.requestBytes),
    responseBytes: optionalNonNegativeInteger(usage.responseBytes),
    artifactBytes: optionalNonNegativeInteger(usage.artifactBytes)
  });
}

export function createBillingAttributionReceipt({
  requestId,
  requesterId,
  requesterTenant = null,
  providerId,
  providerOwnerId,
  providerTenant = null,
  billingMode,
  billingResponsibility,
  status = 'success',
  usage = {},
  latencyMs = null,
  providerRequestId = null,
  authorizationDecision = null,
  quotaDecision = null
} = {}) {
  const normalizedMode = requiredString('billingMode', billingMode).toLowerCase();
  if (!BILLING_MODES.has(normalizedMode)) throw new Error(`Unsupported billingMode: ${billingMode}`);

  const normalizedStatus = requiredString('status', status).toLowerCase();
  if (!RECEIPT_STATUSES.has(normalizedStatus)) throw new Error(`Unsupported billing attribution status: ${status}`);

  const receipt = {
    version: 'billing-attribution/1',
    requestId: requiredString('requestId', requestId),
    requesterId: requiredString('requesterId', requesterId),
    requesterTenant: optionalString(requesterTenant),
    providerId: requiredString('providerId', providerId),
    providerOwnerId: requiredString('providerOwnerId', providerOwnerId),
    providerTenant: optionalString(providerTenant),
    billingMode: normalizedMode,
    billingResponsibility: requiredString('billingResponsibility', billingResponsibility),
    status: normalizedStatus,
    usage: normalizeUsage(usage),
    latencyMs: optionalNonNegativeNumber(latencyMs),
    providerRequestId: optionalString(providerRequestId),
    authorizationDecision: optionalString(authorizationDecision),
    quotaDecision: optionalString(quotaDecision)
  };

  return Object.freeze(receipt);
}

export function billingAttributionFromExecution({
  need,
  providerId,
  providerOwnerId = providerId,
  billing,
  resultMetadata = {},
  status = 'success',
  requesterTenant = null,
  providerTenant = null
} = {}) {
  if (!billing?.mode || !billing?.billingResponsibility) {
    throw new Error('billing authorization decision is required');
  }

  return createBillingAttributionReceipt({
    requestId: need?.id,
    requesterId: need?.from,
    requesterTenant,
    providerId,
    providerOwnerId,
    providerTenant,
    billingMode: billing.mode,
    billingResponsibility: billing.billingResponsibility,
    status,
    usage: {
      inputTokens: resultMetadata.inputTokens,
      outputTokens: resultMetadata.outputTokens,
      totalTokens: resultMetadata.totalTokens,
      estimatedTokens: need?.payload?.policy?.billing?.maxTokens,
      reservedTokens: billing.reservedTokens,
      requestBytes: resultMetadata.requestBytes,
      responseBytes: resultMetadata.responseBytes,
      artifactBytes: resultMetadata.artifactBytes
    },
    latencyMs: resultMetadata.latencyMs,
    providerRequestId: resultMetadata.requestId || resultMetadata.providerRequestId,
    authorizationDecision: 'allowed',
    quotaDecision: billing.reservedTokens ? 'reserved' : null
  });
}
