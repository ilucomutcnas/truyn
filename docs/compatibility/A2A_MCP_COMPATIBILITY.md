# A2A / MCP Compatibility Matrix

**Snapshot:** 2026-08-22  
**TRUYN software:** `0.1.0-dev`  
**TRUYN protocol:** `TRUYN/1` draft

This document records factual compatibility status for the A2A and MCP interoperability edges. It is intentionally stricter than architecture intent: **defined is not implemented, and implemented is not the same as externally certified conformance.**

## Current matrix

| Surface | Target external line | Status | Evidence / limitation |
|---|---|---|---|
| TRUYN as MCP server, stdio | MCP current + selected legacy behavior | **Implemented reference path** | `adapters/mcp/server.js`; bounded tests exist |
| TRUYN as MCP server, loopback HTTP | MCP `2026-07-28` transport shape + selected legacy behavior | **Implemented / bounded CI-proven** | POST-only loopback bridge, Origin guard, modern routing headers; not claimed as complete ecosystem certification |
| MCP client/provider path | MCP `2026-07-28` | **Implemented bounded single-tool path** | `adapters/providers/mcp-http-tool.js`; configured tool only, not general discovery/import |
| General MCP tool discovery/import | MCP `2026-07-28` | **Not implemented** | planned interoperability gate |
| MCP resources → TRUYN objects/state | MCP `2026-07-28` | **Defined only** | semantic mapping requires explicit immutability/publication rules |
| A2A Agent Card facade | A2A 1.x | **Defined only** | no `adapters/a2a/` implementation yet |
| A2A server task interface | A2A 1.x | **Defined only** | Send Message / Task / Artifact bridge not implemented |
| A2A client/provider adapter | A2A 1.x | **Defined only** | remote skills are not yet imported into TRUYN offers |
| A2A→TRUYN→MCP round trip | A2A 1.x + MCP current | **Not implemented / not proven** | required acceptance gate |
| MCP→TRUYN→A2A round trip | MCP current + A2A 1.x | **Not implemented / not proven** | required acceptance gate |
| Cross-protocol security negative matrix | A2A + MCP | **Not implemented** | must prove zero unauthorized provider execution/discovery through both edges |
| Stable compatibility guarantee | A2A + MCP | **Not available** | TRUYN/1 remains draft and adapters evolve independently |

## What the existing MCP code proves

The repository currently proves a bounded MCP integration, not a merely aspirational adapter declaration.

`adapters/mcp/server.js` exposes:

- `truyn_identity`;
- `truyn_find`;
- `truyn_offer`;
- `truyn_need`;
- `truyn_poll`;
- `truyn_result`.

`tests/adapters.test.js` exercises MCP discovery/tool listing/tool execution and the loopback HTTP path with modern protocol routing headers.

`adapters/providers/mcp-http-tool.js` can invoke one configured remote MCP tool as a TRUYN provider path.

The boundary that remains open is **generalized and certified interoperability**: complete current MCP conformance, generic discovery/import, A2A support and real bidirectional A2A↔TRUYN↔MCP proof.

## A2A mapping target

The initial bridge contract is:

```text
Agent Card skill        → TRUYN capability / authorized OFFER view
A2A Message             → NEED input / continuation metadata
A2A Task + context IDs  → adapter correlation state
A2A Artifact            → RESULT output / ArtifactRef
A2A security scheme     → adapter authentication, not provider authorization
```

Private TRUYN providers MUST NOT become public simply because an Agent Card is publicly retrievable.

## MCP mapping target

The initial bridge contract is:

```text
MCP tool call           → TRUYN tool operation or provider execution
MCP tool                → selected TRUYN capability
MCP structured content  → RESULT output
MCP resource            → OBJECT/STATE only when semantics are explicitly safe
MCP client metadata     → correlation/telemetry, not TRUYN ownership identity
```

## Version policy

A2A, MCP and TRUYN have independent release cadence.

- A bridge MUST report the external protocol version it actually implements.
- Unsupported versions MUST fail explicitly rather than silently changing semantics.
- Compatibility fallbacks must be separately tested.
- A2A/MCP version changes SHOULD be absorbed in adapters without changing `TRUYN/1` unless TRUYN network semantics change.
- Benchmark/evidence reports MUST name the exact external versions exercised.

## Acceptance evidence required

Before this matrix can mark A2A/MCP bridge compatibility as proven, the repository needs a durable evidence report covering:

1. A2A Agent Card discovery and authenticated/private discovery behavior;
2. A2A task + artifact execution through TRUYN;
3. TRUYN execution of a remote A2A provider;
4. current MCP server/client compatibility for the selected feature set;
5. A2A→TRUYN→MCP round trip;
6. MCP→TRUYN→A2A round trip;
7. text/structured data and at least one referenced file/artifact case;
8. asynchronous task lifecycle;
9. version mismatch/fallback cases;
10. unauthorized discovery/execution negative tests proving provider execution count remains zero.

Architecture: `../architecture/A2A_MCP_INTEROPERABILITY.md`.
