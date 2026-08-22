# TRUYN A2A / MCP Interoperability Architecture

**Status:** canonical interoperability architecture. MCP has bounded executable reference paths; A2A and the end-to-end A2A↔TRUYN↔MCP bridge are defined here but not yet implemented or certified.

**Snapshot:** 2026-08-22

## Purpose

TRUYN is an intelligence network, not a replacement for every agent protocol. A2A and MCP solve adjacent interoperability problems and should connect at the edge without becoming mandatory TRUYN/1 wire dependencies.

The target is:

```text
A2A agent / client                  MCP client / server
       │                                   │
       └──── A2A adapter ─┐   ┌─ MCP adapter ─────┘
                          ▼   ▼
                       TRUYN Node
              IDENTITY · OFFER · NEED · RESULT
              authorization · provenance · trust
                          │
                    TRUYN network
```

The architectural rule is:

> **A2A and MCP are replaceable interoperability edges. TRUYN remains the network contract.**

Protocol evolution in A2A or MCP MUST NOT force a new TRUYN protocol generation unless TRUYN network semantics themselves change.

## External protocol roles

### A2A

A2A provides a standard interaction model for independent agent systems. Its released specification defines Agent Cards for discovery, skills/capabilities, Messages, Tasks, task state, Artifacts, streaming updates and authentication requirements.

TRUYN should use A2A where an external agent expects agent-to-agent discovery and task lifecycle semantics.

### MCP

MCP provides a standard way for model/agent clients to discover and invoke tools and other server capabilities. TRUYN should use MCP where an agent/runtime expects tools/resources exposed by an MCP server or where a remote MCP tool should be presented as a TRUYN capability.

The current repository already contains bounded MCP reference paths:

- `adapters/mcp/server.js`: TRUYN-as-MCP server over stdio and loopback HTTP;
- `adapters/providers/mcp-http-tool.js`: one configured remote MCP HTTP tool exposed through the provider-adapter contract;
- tests covering MCP discovery/tool invocation and modern HTTP routing headers.

These paths are implementation evidence, not a claim of complete ecosystem certification or full conformance with every current MCP feature.

## Compatibility boundary

TRUYN does not copy A2A or MCP objects into the core protocol verbatim. Adapters normalize external semantics into stable TRUYN concepts and retain external identifiers as provenance/correlation metadata when useful.

External authentication is also not TRUYN provider authorization:

```text
A2A/MCP transport authentication
          ≠
TRUYN requester/provider authorization
          ≠
Trustability
          ≠
settlement
```

A request that entered through A2A or MCP MUST pass the same provider ownership, visibility, billing/entitlement and trust policy as an equivalent native TRUYN request.

## A2A → TRUYN mapping

The first A2A bridge SHOULD map concepts as follows.

| A2A concept | TRUYN mapping | Notes |
|---|---|---|
| Agent Card identity/provider metadata | adapter identity metadata + TRUYN cryptographic node identity | A2A metadata never replaces TRUYN signed identity |
| Agent Card skill | `CAPABILITY` / `OFFER` candidate | only offers authorized for the A2A audience may be published |
| Agent Card security requirements | adapter/gateway authentication policy | not a substitute for provider authorization |
| Message initiating work | `NEED` | content becomes normalized input; policy is derived explicitly |
| Task ID / context ID | bridge correlation metadata | A2A task state remains an adapter concern |
| Task status | bridge-local lifecycle/status projection | does not create a new TRUYN/1 primitive |
| Artifact | `RESULT` output or content-addressed artifact reference | preserve media type, digest and provenance where available |
| Streaming updates | adapter stream derived from TRUYN/provider progress where supported | absence of native streaming must be represented honestly |
| Cancel task | adapter cancellation when the execution path supports cancellation | MUST NOT pretend `REVOKE` is universally equivalent to task cancel |
| Extended Agent Card | authenticated adapter discovery view | must preserve TRUYN discovery authorization |

### Agent Card exposure

A TRUYN A2A server facade MUST NOT dump every known `OFFER` into a public Agent Card.

The card is a compatibility view over the **authorized/publishable** capability set. Private owner-only/BYOK providers remain hidden unless the caller is explicitly permitted through an authenticated extended-card/discovery path.

A2A skills are descriptive compatibility metadata; the authoritative execution decision remains the TRUYN capability + authorization + policy pipeline.

## TRUYN → A2A provider adapter

The reverse bridge allows a remote A2A agent to participate as a TRUYN provider without becoming a native TRUYN implementation.

Target flow:

```text
remote A2A Agent Card
        ↓ validate / authenticate
A2A client adapter
        ↓ normalize selected skills
TRUYN OFFER(s)
        ↓ authorized NEED
A2A Send Message / Task
        ↓
A2A Artifact / terminal response
        ↓ normalize + provenance
TRUYN RESULT
```

Required properties:

1. skill import is explicit and bounded; do not blindly expose every remote skill;
2. remote A2A endpoint/auth credentials remain adapter-local;
3. provider ownership is the TRUYN identity operating the adapter, not requester-supplied A2A metadata;
4. A2A task/context IDs are correlation metadata, not TRUYN authorization identities;
5. remote artifacts preserve digest/media/provenance metadata where possible;
6. failures, unsupported modalities and task rejection remain explicit;
7. no A2A response can bypass the provider-host billing/access boundary.

## MCP → TRUYN mapping

The existing MCP server surface exposes TRUYN operations as tools:

```text
truyn_identity
truyn_find
truyn_offer
truyn_need
truyn_poll
truyn_result
```

This is the minimum agent-facing bridge for MCP clients.

The next MCP compatibility gate MUST distinguish three layers:

1. **TRUYN-as-MCP server**: MCP client invokes TRUYN tools;
2. **MCP-tool-as-TRUYN provider**: TRUYN invokes an authorized external MCP tool;
3. **general MCP import/discovery**: discover a remote MCP server's allowed tools/resources and map selected entries to TRUYN capabilities/objects.

Only the first two have bounded reference implementation today, and the second is currently a configured single-tool path rather than a general discovery/import bridge.

### MCP resources

A future general MCP resource adapter MAY map immutable resources to TRUYN `OBJECT` references and mutable resource views to explicit state objects when the semantics are safe. It MUST NOT assume every MCP resource is immutable, content-addressed or globally publishable.

### MCP prompts

MCP prompts are an application/client assistance surface, not a TRUYN network primitive. They may be passed through an adapter but should not become protocol-level TRUYN capabilities unless an implementation explicitly models them as executable behavior.

## A2A ↔ TRUYN ↔ MCP bridge

The implementation milestone is not complete merely because separate A2A and MCP adapters exist. TRUYN must prove cross-protocol cooperation in both directions.

Required reference flows:

```text
A2A client
   ↓ Agent Card + Send Message
TRUYN A2A facade
   ↓ NEED
TRUYN network
   ↓ authorized provider
MCP tool provider
   ↓
TRUYN RESULT
   ↓
A2A Task/Artifact
```

and:

```text
MCP client
   ↓ truyn_need
TRUYN MCP facade
   ↓ NEED
TRUYN network
   ↓ authorized provider
remote A2A agent
   ↓ Task/Artifact
TRUYN RESULT
   ↓
MCP tool result
```

Both flows MUST preserve correlation, identity, authorization, provenance, error state and artifact integrity without allowing external-protocol metadata to become authoritative TRUYN ownership/billing data.

## Versioning

A2A, MCP and TRUYN versions are independent dimensions.

The adapter layer MUST record and negotiate the external protocol version it actually supports. A compatibility update SHOULD remain adapter-local whenever possible.

As of this snapshot, the implementation work should target the current A2A 1.x released line and MCP `2026-07-28`, while retaining explicitly tested legacy MCP behavior only where useful. Version names belong in compatibility/evidence documents rather than the stable TRUYN capability namespace.

## Security invariants

All A2A/MCP bridges MUST satisfy:

- fail closed when external authentication or TRUYN authorization is ambiguous;
- never accept external `ownerId`, tenant, billing mode or provider identity as authoritative merely because it appears in protocol metadata;
- never expose private TRUYN offers through Agent Cards, MCP tool lists or resource lists without authorization;
- keep remote A2A/MCP credentials in the adapter/runtime secret boundary;
- preserve equivalent authorization across HTTP, streaming, stdio and native paths;
- prevent protocol translation from turning unsupported states into apparent success;
- bound request sizes, streams, task lifetimes and polling to prevent resource abuse;
- preserve artifact digests/provenance where available;
- keep Trustability separate from external-protocol authentication;
- keep settlement adapters separate from interoperability adapters.

## Implementation gate

The A2A/MCP interoperability step is closed only when all of the following are true:

1. **MCP conformance closure**: current supported MCP server path follows the targeted current transport/message contract; configured remote-tool path remains compatible; tests cover unsupported versions and security failure cases.
2. **A2A server facade**: authorized TRUYN capabilities can be exposed through an Agent Card and A2A task interface without leaking private providers.
3. **A2A client/provider adapter**: selected remote A2A skills can be imported as TRUYN providers and executed through the normal authorization boundary.
4. **Bidirectional cross-protocol proof**: A2A→TRUYN→MCP and MCP→TRUYN→A2A complete real task/result round trips.
5. **Artifact proof**: structured/text and referenced file/media outputs preserve integrity/provenance through translation.
6. **Long-running task proof**: at least one asynchronous A2A task survives polling/streaming lifecycle without semantic loss.
7. **Negative security matrix**: unauthorized private provider discovery/execution remains zero through both external protocols.
8. **Version matrix**: exact A2A/MCP versions and tested compatibility are recorded under `docs/compatibility/`.
9. **Durable evidence**: a public sanitized interoperability report records tested commit, cases, failures/limitations and results.

## Non-goals

This work does not:

- make A2A or MCP mandatory for TRUYN nodes;
- replace TRUYN cryptographic identity with Agent Cards or MCP client metadata;
- add A2A Task or MCP Tool as new TRUYN/1 wire primitives;
- promise one-to-one semantic equivalence for every A2A/MCP feature;
- make a public A2A/MCP endpoint permission to consume owner-funded AI quota;
- couple TRUYN protocol releases to external protocol release cadence.

## Repository ownership

Target implementation locations:

```text
adapters/a2a/                 # A2A server facade + client/provider bridge
adapters/mcp/                 # MCP-facing TRUYN server
adapters/providers/           # MCP/A2A-backed provider adapters where appropriate
tests/interoperability/       # cross-protocol contract and negative tests
docs/compatibility/           # tested version/support matrix
docs/benchmarks/              # durable interoperability evidence
```

The architecture belongs here; normative TRUYN wire semantics remain under `spec/`.
