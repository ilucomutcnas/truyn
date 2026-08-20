# TRUYN MVP — AI Interoperability

**Implementation status:** working interoperability/provider layer with implemented provider-ownership/default-deny security baseline and a real decentralized QUIC/Kademlia network underlay.  
**Snapshot:** 2026-08-20.

This document describes executable reference code. Provider adapters, cloud test deployments and compatibility bridges are not themselves a claim that every vendor is certified or that TRUYN mainnet is productionized.

## What the interoperability layer proves

TRUYN supports the conceptual path:

```text
agent / MCP client / HTTP client
            ↓
        TRUYN Node
            ↓
 signed OFFER / NEED / RESULT
            ↓
authorized discovery / routing
            ↓
 direct QUIC or explicit relay fallback
            ↓
        TRUYN Node
            ↓
      provider adapter
            ↓
        AI provider
```

A requester does not need the native API contract of every provider. TRUYN can expose a capability-oriented contract while adapters translate to provider-specific execution.

Interoperability and entitlement remain separate questions:

```text
Can this provider perform the capability?
Can this requester use this provider?
```

Authorization is evaluated before chargeable/private execution.

## Implemented provider-security boundary

The previously planned hardening target is now implemented as a reference baseline:

- provider ownership is bound to signed/authenticated provider identity rather than requester-controlled metadata;
- low-level provider access defaults to `owner-only`;
- private-provider discovery and dispatch are authorization-aware;
- provider-signed requester allowlists support private/BYOK relationships;
- provider-host execution performs a second authorization/billing decision before `adapter.execute()`;
- owner-funded public execution is denied without explicit policy;
- public network registration/dispatch and public provider execution require separate explicit opt-ins;
- legacy/compact/WebSocket/MCP execution surfaces must preserve equivalent central authorization;
- prepaid/subscription modes fail closed without entitlement resolution;
- sponsored mode cannot activate without actor-bound signed entitlement verification and durable atomic usage accounting.

Negative security evidence is designed around the invariant:

```text
foreign requester
+ known private provider ID
+ custom client
= zero unauthorized adapter/upstream execution
```

This does not yet mean rich commercial account/org tenancy, every production perimeter deployment, or durable commercial entitlement issuance is complete.

## BYOK rule

Normal user operation is **BYOK — Bring Your Own Intelligence / Bring Your Own Provider**.

Provider credentials remain in the user's local/provider runtime or appropriate cloud/OS secret store. Credentials are not TRUYN `OFFER`, `NEED` or `RESULT` payloads and do not travel through discovery.

The official CLI contains reference setup flows for supported provider profiles, including OpenAI, OpenAI-compatible/local, Anthropic, Azure OpenAI, Vertex Gemini, generic custom HTTP and stateless MCP HTTP tool providers.

Typical setup:

```bash
truyn init
export OPENAI_API_KEY='...'
truyn setup --provider openai --model <your-model>
truyn setup --provider openai --model <your-model> --test
truyn setup-status
```

Persisted profiles retain non-secret settings and credential environment-variable names where required; resolved secret values are not written to normal profile/status output.

Requester and remote BYOK provider use separate TRUYN identities. The provider is published private/owner-only for the configured requester and uses billing mode `byok`.

See [BYOK](BYOK.md).

## Verify without paid AI APIs

```bash
npm test
npm run demo:ai
```

Deterministic/local adapters should remain the default path for reproducible no-credential tests. Benchmark reports explicitly distinguish provider-reported usage, estimates and serialized-byte proxies.

## MCP adapter

TRUYN exposes identity/discovery/offers/needs/polling/results through its MCP compatibility surface.

Typical local start:

```bash
truyn init
truyn mcp --relay http://127.0.0.1:8787
```

MCP is a connection surface, **not** an authorization bypass. Provider execution reached through MCP must pass the same central provider policy as HTTP/WebSocket/SDK/native paths.

## Universal/custom HTTP adapter

The HTTP bridge allows software that does not speak MCP/native TRUYN to participate. Generic custom HTTP JSON and compatible provider paths exist as reference adapters.

A compatibility bridge is not a separate security domain. Execution-capable requests still require valid provider authorization and billing responsibility.

## Multi-cloud reference providers

The public provider layer contains reference adapters across independent clouds and modalities.

| Capability | Google Cloud / Vertex AI | Microsoft Azure / Foundry |
|---|---|---|
| reasoning / text | Gemini | GPT, Grok, DeepSeek, Llama, Mistral, Kimi |
| image generation | Google image-generation track | Azure OpenAI `gpt-image`, FLUX adapter |
| video generation | Veo | Sora adapter |

Concrete model/deployment availability varies with provider entitlement, region and quota. Adapter implementation is not the same as a guaranteed live deployment.

Media outputs use normalized artifact references/provenance rather than requiring large image/video binaries inside TRUYN result envelopes.

See `../architecture/MULTI_CLOUD_PROVIDER_ARCHITECTURE.md`.

## Decentralized network status

The interoperability layer is no longer limited to the original HTTP relay MVP. The repository contains:

- real QUIC/UDP;
- signed authenticated peer sessions;
- Kademlia discovery/state RPC;
- direct-first P2P signed-envelope routing;
- explicit relay fallback;
- STUN/same-port hole-punch reference path;
- peer-record lifecycle and DHT durability/repair slices.

Real-network evidence has progressed through:

- v0.1 Connect — closed;
- Class B real multi-host — accepted;
- Class C heterogeneous Azure/GCP WAN/NAT/relay — accepted;
- Class D-100 real-node scale — active, not yet accepted at the 2026-08-20 snapshot.

## Public relay / private provider rule

A public TRUYN relay can coexist with private providers because network reachability and provider entitlement are separate.

```text
public network reachability
        ≠
permission to consume provider quota
```

Knowing a private provider ID, discovering the host, traversing NAT, connecting over QUIC or implementing a custom client does not authorize execution.

## Current completion boundary

Implemented/evidenced reference functionality includes:

- signed identities and capability exchange;
- MCP/HTTP/provider interoperability;
- multi-cloud provider adapters;
- BYOK setup/reference credential locality;
- owner-only/default-deny provider policy;
- authorization-aware discovery/dispatch;
- provider-host second check and billing gate;
- real QUIC/Kademlia underlay;
- Class B and Class C real-network acceptance;
- semantic retrieval/distributed retrieval;
- Trustability/claim/provenance reference slices.

Still not claimed complete:

- accepted 100- and 1,000-real-node productionization gates;
- repeated large randomized open-network adversarial resilience;
- carrier-field CGNAT universality;
- production commercial account/org/tenant control plane;
- durable sponsored/prepaid/subscription accounting deployment;
- general compute sandbox/compute-near-data productionization;
- stable SDK/ecosystem certification;
- installer/updater/rollback operational closure;
- stable `TRUYN/1` and production mainnet.

Read the current truth in:

- [Implementation Status](../architecture/IMPLEMENTATION_STATUS.md)
- [Network Productionization Gate](../architecture/NETWORK_PRODUCTIONIZATION_GATE.md)
- [Productionization Execution Plan](../operations/PRODUCTIONIZATION_EXECUTION_PLAN.md)
- [Benchmark Evidence](../benchmarks/README.md)
- [Roadmap](../../ROADMAP.md).