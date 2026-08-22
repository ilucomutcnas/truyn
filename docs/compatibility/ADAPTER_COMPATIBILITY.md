# TRUYN Adapter Compatibility

**Status:** reference adapter compatibility map; provider availability and entitlement remain independent.

## Compatibility principle

TRUYN exposes stable logical capabilities; vendor/model IDs are adapter metadata, not the protocol capability namespace.

An adapter being present does **not** imply:

- the cloud model is deployed/entitled;
- the provider is publicly usable;
- the provider version is permanently stable;
- every vendor-specific feature maps to a TRUYN capability.

## Adapters versus first-party SDKs

Adapters and SDKs serve different directions of interoperability:

```text
external AI/provider/framework
          ↓
       adapter
          ↓
        TRUYN
          ↑
   first-party SDK
          ↑
application / agent code
```

- **Adapters** bridge external provider/agent ecosystems into TRUYN capabilities.
- **First-party SDKs** let application developers consume TRUYN from JavaScript/TypeScript, Python, Go, Java and C#/.NET without manually implementing the protocol.

An SDK does not replace provider adapters, and an adapter does not satisfy the first-party SDK requirement.

SDK compatibility is defined separately in `SDK_COMPATIBILITY.md`.

## User/BYOK reference surfaces

The current repository contains reference setup/runtime support for combinations including:

- OpenAI;
- OpenAI-compatible and user-controlled local compatible runtimes;
- Anthropic;
- Azure OpenAI;
- Vertex Gemini;
- generic custom HTTP JSON provider;
- stateless MCP HTTP tool provider.

BYOK profiles store non-secret settings and credential environment-variable references rather than raw credential values.

## Project reference multi-cloud providers

The provider layer also contains project/reference adapter paths for text/image/video families used in TRUYN smoke/benchmark work, including Gemini, GPT, Grok, DeepSeek, Llama, Mistral, Kimi, Google image generation, Azure image paths, Veo and Sora-family paths.

Individual cloud deployment access can remain `blocked_access` even when adapter code exists.

## Compatibility requirements for adapters

An adapter should preserve:

- logical capability identity independent of concrete model version;
- normalized provider provenance/usage/latency metadata where available;
- provider access/billing checks before upstream execution;
- artifact references/digests for large media rather than leaking private storage credentials;
- provider-specific errors without leaking secrets/private topology;
- explicit unsupported/blocked status rather than pretending success.

If an adapter exposes participant discovery metadata through a TRUYN Agent Descriptor, the descriptor must contain only intentionally visible capability/interface information for that requester. It does not replace provider-policy discovery or grant authorization.

## Version changes

Model catalogs and APIs change faster than the TRUYN protocol. Adapter/model upgrades should therefore be independently testable and should not require a new protocol generation unless network semantics themselves change.

When a provider version change materially affects benchmark comparability, record the concrete model/version in the benchmark evidence.

SDK API/version changes follow the separate SDK compatibility policy rather than being coupled to provider model releases.
