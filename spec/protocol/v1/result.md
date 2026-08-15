# TRUYN/1 RESULT

**Status:** draft normative skeleton.

`RESULT` satisfies a `NEED` or `COMPUTE` request. A result can carry inline output and/or references to content-addressed objects, claims, artifacts and trust receipts.

A result SHOULD identify the original request, provider, completion time and signature. It MAY report measured latency, price/resource usage and execution metadata.

## Usage and billing attribution

Where a provider exposes usage information, a result/audit record may include normalized usage metadata such as input/output/total tokens, provider-native usage units, artifact bytes, latency and provider request ID.

Billing/authorization state used to permit execution is authoritative server/provider policy state. A `RESULT` can report attribution, but it does not retroactively authorize the request that produced it.

Raw provider credentials, cloud secrets and private authorization tokens MUST NOT be embedded in a `RESULT`.

Public benchmark results SHOULD avoid exposing unnecessary private operational identifiers even when internal audit records retain them.

## Trust distinction

A signed result proves attribution/integrity, not factual truth. Claims within/behind a result are evaluated separately through Trustability.

Authorization and Trustability are distinct: authorization answers whether the provider may be used; Trustability helps decide how much the returned information should be relied upon.
