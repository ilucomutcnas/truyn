# TRUYN Adapter Compatibility

**Status:** reference adapter compatibility map; provider availability, entitlement and external-protocol certification remain independent.

## Compatibility principle

TRUYN exposes stable logical capabilities; vendor/model IDs and external protocol objects are adapter metadata, not the TRUYN capability namespace.

An adapter being present does **not** imply:

- the cloud model is deployed/entitled;
- the provider is publicly usable;
- the provider version is permanently stable;
- every vendor-specific feature maps to a TRUYN capability;
- an external protocol implementation is complete or certified;
- A2A/MCP authentication replaces TRUYN provider authorization.

## User/BYOK reference surfaces

The current repository contains reference setup/runtime support for combinations including:

- OpenAI;
- OpenAI-compatible and user-controlled local compatible runtimes;
- Anthropic;
- Azure OpenAI;
- Vertex Gemini;
- generic custom HTTP JSON provider;
- MCP stdio/loopback HTTP server exposing TRUYN tools;
- stateless/configured MCP HTTP tool provider.

BYOK profiles store non-secret settings and credential environment-variable references rather than raw credential values.

## A2A / MCP interoperability status

The two protocol families are intentionally treated as **external interoperability edges**, not as TRUYN/1 wire dependencies.

Current factual status:

- MCP TRUYN-server path: **implemented reference path**;
- MCP loopback HTTP path: **bounded CI-proven** for the covered tool/header behavior;
- MCP remote provider path: **implemented bounded configured single-tool path**;
- general MCP discovery/import: **not implemented**;
- A2A Agent Card/server facade: **defined only**;
- A2A client/provider adapter: **defined only**;
- A2A→TRUYN→MCP and MCP→TRUYN→A2A end-to-end bridges: **not implemented / not proven**.

This distinction matters: the project already has working MCP code, but it does **not** yet have the full A2A/MCP interoperability bridge or a cross-protocol certification gate.

See:

- `A2A_MCP_COMPATIBILITY.md`
- `../architecture/A2A_MCP_INTEROPERABILITY.md`

## Project reference multi-cloud providers

The provider layer also contains project/reference adapter paths for text/image/video families used in TRUYN smoke/benchmark work, including Gemini, GPT, Grok, DeepSeek, Llama, Mistral, Kimi, Google image generation, Azure image paths, Veo and Sora-family paths.

Individual cloud deployment access can remain `blocked_access` even when adapter code exists.

## Compatibility requirements for adapters

An adapter should preserve:

- logical capability identity independent of concrete model or external-protocol version;
- normalized provider provenance/usage/latency metadata where available;
- provider access/billing checks before upstream execution;
- artifact references/digests for large media rather than leaking private storage credentials;
- provider-specific errors without leaking secrets/private topology;
- explicit unsupported/blocked status rather than pretending success;
- version negotiation/failure semantics for external protocols;
- external credentials inside the adapter/runtime secret boundary;
- the distinction between transport authentication, provider authorization, Trustability and settlement.

A2A/MCP adapters must additionally avoid exposing private offers/resources/tools merely because an external discovery endpoint is reachable.

## Version changes

Model catalogs and external agent protocols change faster than the TRUYN protocol. Adapter/model/A2A/MCP upgrades should therefore be independently testable and should not require a new TRUYN protocol generation unless network semantics themselves change.

When a provider or external protocol version change materially affects compatibility or benchmark comparability, record the concrete tested version in compatibility/evidence documentation.
