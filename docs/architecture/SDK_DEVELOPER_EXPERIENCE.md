# TRUYN SDK and Developer Experience Architecture

**Status:** defined architecture / implementation program.  
**Implementation maturity:** SDK scaffolding exists for some languages; production-ready first-party SDKs and Agent Descriptor serving/discovery are not yet implemented.  
**Protocol generation:** `TRUYN/1` draft.

TRUYN cannot become an open intelligence network if joining it requires reading internal Node.js code, hand-crafting envelopes, or writing a bespoke adapter for every application. Developer experience is therefore a first-class architecture surface, not an afterthought.

The target developer experience is:

```text
install SDK
    ↓
load or discover a TRUYN Agent Descriptor
    ↓
connect to a local/remote TRUYN node
    ↓
discover authorized capabilities
    ↓
publish OFFER / submit NEED / receive RESULT
    ↓
verify identity, provenance and trust metadata
```

The first-party SDK program MUST cover:

- JavaScript / TypeScript;
- Python;
- Go;
- Java;
- C# / .NET.

Rust may remain an additional/secondary SDK track, but it is not a substitute for the five required first-party language targets above.

## 1. Architectural position

SDKs are clients of TRUYN. They do not redefine TRUYN.

```text
application / agent / framework
            ↓
    first-party TRUYN SDK
            ↓
   Node API / gateway / native client
            ↓
         TRUYN Node
            ↓
 identity · discovery · routing · objects/state
 authorization · billing · provenance · trustability
            ↓
       QUIC / UDP / IP
```

The SDK layer MUST preserve the same protocol, authorization, billing and trust boundaries as CLI, MCP, HTTP, WebSocket and native node paths. An SDK is never an authorization bypass.

## 2. Required first-party SDK matrix

| Language | Repository target | Package/distribution target | Required status before v1 stable |
|---|---|---|---|
| JavaScript / TypeScript | `sdk/typescript/` | npm | stable first-party SDK |
| Python | `sdk/python/` | PyPI | stable first-party SDK |
| Go | `sdk/go/` | Go module | stable first-party SDK |
| Java | `sdk/java/` | Maven Central-compatible publication | stable first-party SDK |
| C# / .NET | `sdk/dotnet/` | NuGet | stable first-party SDK |
| Rust | `sdk/rust/` | crates.io-compatible if maintained | optional additional track |

All first-party SDKs are licensed under Apache-2.0 and must preserve the repository `NOTICE` requirements.

## 3. One SDK contract, multiple idiomatic implementations

All required SDKs MUST expose equivalent semantics while remaining idiomatic in their host language.

The common logical surface is:

```text
Client / NodeConnection
Identity
AgentDescriptor
Capability
Offer
Need
Result
ObjectRef / ArtifactRef
Claim / Attest / TrustReceipt where supported
Subscription / stream where supported
Error / status taxonomy
```

A minimum useful SDK must support:

1. create/load client configuration;
2. connect to local or remote TRUYN node/gateway;
3. read local/requester identity;
4. fetch/verify an Agent Descriptor;
5. discover authorized capabilities/providers;
6. publish and revoke an `OFFER`;
7. submit a `NEED`;
8. await/poll/stream the corresponding `RESULT`;
9. verify signed identity/result metadata exposed by the node;
10. work with content/artifact references without requiring large binary payloads inside envelopes;
11. surface normalized TRUYN errors without leaking credentials/private topology;
12. preserve cancellation, deadline and timeout semantics;
13. expose protocol/software compatibility information.

Later SDK maturity should add complete typed access to generic `OBJECT`, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE`, `CLAIM`, `ATTEST`, `TRUST_RECEIPT` and `REVOKE` behavior as those contracts stabilize.

## 4. TRUYN Agent Descriptor

TRUYN defines a **TRUYN Agent Descriptor** as the onboarding/discovery self-description document for a TRUYN-facing agent, service or node.

Its role is analogous to an agent card in other agent interoperability systems, but it is a TRUYN contract and does not make TRUYN dependent on another protocol.

The Descriptor answers:

> Who is this participant, what TRUYN versions/interfaces can it use, what public capability classes does it intentionally advertise, what interaction modes does it support, and how can a client begin a compatible interaction?

It does **not** answer:

> Is a specific provider currently available to me, am I authorized to use it, what is its current dynamic price/capacity, or should TRUYN route my request there?

Those remain dynamic network/policy questions handled by signed `OFFER`, provider authorization, billing/entitlement policy, routing and Trustability.

### Target discovery locations

For HTTP-facing participants, the target well-known location is:

```text
https://<domain>/.well-known/truyn-agent.json
```

TRUYN-native discovery MAY also return or reference an Agent Descriptor through authenticated network discovery without requiring a public HTTP origin.

Direct configuration/registry discovery MAY be supported as additional bootstrap mechanisms.

### Draft logical shape

```json
{
  "schema": "truyn.agent-descriptor/v1",
  "descriptorVersion": "1",
  "identity": "truyn:node:<id>",
  "name": "Example Agent",
  "description": "Optional human-readable description",
  "protocols": ["TRUYN/1"],
  "interfaces": [
    {
      "type": "https",
      "endpoint": "https://agent.example/truyn"
    }
  ],
  "capabilities": [
    {
      "id": "reasoning.general",
      "inputModes": ["application/json", "text/plain"],
      "outputModes": ["application/json", "text/plain"],
      "interactionModes": ["request-response"]
    }
  ],
  "features": {
    "streaming": false,
    "artifacts": true,
    "trustReceipts": true
  },
  "security": {
    "signedEnvelopes": true,
    "authorization": "policy-before-dispatch"
  },
  "issuedAt": "<timestamp>",
  "expiresAt": "<timestamp>",
  "signature": "<descriptor signature or signature reference>"
}
```

The exact normative field rules live in `spec/protocol/v1/agent-descriptor.md` while `TRUYN/1` remains draft.

## 5. Descriptor versus OFFER

The distinction is mandatory:

| Concern | Agent Descriptor | `OFFER` |
|---|---|---|
| Purpose | bootstrap/self-description | dynamic network advertisement |
| Typical lifetime | relatively stable, cacheable, expiry-bound | dynamic/shorter-lived |
| Protocol/interface support | yes | not primary role |
| Public capability class | yes, when intentionally public | yes, under provider policy |
| Dynamic availability/capacity | no | yes |
| Dynamic price/conditions | no | yes |
| Requester authorization | never grants it | still requires provider-policy decision |
| Provider selection/ranking | no | candidate input only |

A Descriptor MUST NOT become a second unprotected provider registry.

## 6. Privacy and security invariants

A public Agent Descriptor MUST NOT contain:

- provider credentials or API keys;
- private node keys;
- private cloud identities/topology that are not intentionally public;
- private provider IDs/capabilities that discovery policy hides from the requester;
- privileged allowlists;
- secret-bearing URLs or long-lived signed download URLs;
- exact private quota/cost ceilings;
- requester-specific authorization grants unless returned through an authenticated scoped view.

The public Descriptor is a public subset only.

An implementation MAY support an authenticated extended/scoped Descriptor, but it must be generated after requester authentication/authorization and must never weaken the central provider-policy boundary.

Descriptor signatures prove integrity/binding to an identity key or delegated descriptor-signing key. They do not prove that every advertised capability is trustworthy, available, affordable or authorized for the requester.

## 7. Developer onboarding goals

The desired first-success experience is deliberately small.

### JavaScript / TypeScript

```ts
import { TruynClient } from "@truyn/sdk";

const client = await TruynClient.connect({ node: "http://127.0.0.1:8787" });
const agent = await client.discover("reasoning.general");
const result = await client.need({ capability: "reasoning.general", input: { question: "Hello" } });
```

### Python

```python
from truyn import TruynClient

client = TruynClient.connect(node="http://127.0.0.1:8787")
agent = client.discover("reasoning.general")
result = client.need(capability="reasoning.general", input={"question": "Hello"})
```

Java, C#/.NET and Go MUST provide equivalent semantics using idiomatic builders/options/context/cancellation patterns for those ecosystems.

These examples are target API shape, not a claim that the packages are already published.

## 8. Generated schemas and hand-written runtime logic

To prevent semantic drift between five SDKs, the project should generate or mechanically validate as much as possible from canonical protocol/schema sources:

```text
spec/protocol/v1
      +
proto/v1 / JSON schemas where defined
      ↓
shared conformance fixtures
      ↓
TS · Python · Go · Java · .NET SDK implementations
```

Code generation may cover DTOs/types, enums and serialization bindings. Authentication, retries, cancellation, streaming, local credential handling and ergonomic APIs remain language-specific implementation work.

No SDK may invent a wire field or protocol behavior that is absent from the canonical protocol/specification.

## 9. Compatibility requirements

Each first-party SDK release must declare:

- SDK semantic version;
- supported TRUYN protocol generations;
- supported wire/schema generations;
- minimum supported runtime/language version;
- feature matrix;
- deprecated/removed API policy;
- tested node/server version range.

Before `TRUYN/1` stabilization, compatibility is best-effort and may break on testnet with explicit release notes. Stable SDK compatibility is a v1 gate.

## 10. Conformance test suite

A language SDK is not considered implementation-complete because it compiles or can send HTTP.

The shared SDK conformance suite must test at minimum:

- descriptor parse + signature validation;
- protocol-version negotiation/failure;
- identity retrieval;
- authorized capability discovery;
- private capability non-disclosure;
- `OFFER` publish/revoke;
- `NEED` → `RESULT` correlation;
- timeout/deadline/cancellation;
- streaming/polling behavior where advertised;
- normalized error mapping;
- artifact/reference handling;
- unauthorized private-provider execution = zero upstream execution;
- equivalent behavior across HTTP/WebSocket/native surfaces used by the SDK;
- backward/forward compatibility fixtures for supported protocol versions.

The same golden fixtures should be consumed by all first-party SDK repositories/directories wherever practical.

## 11. Documentation required per SDK

Every first-party SDK must ship with:

- install instructions;
- 5-minute quickstart;
- authentication/BYOK guidance;
- descriptor discovery example;
- capability discovery example;
- `NEED`/`RESULT` example;
- async/streaming example when supported;
- error handling reference;
- compatibility matrix;
- runnable example project;
- package provenance/checksum/release link where applicable;
- Apache-2.0 `LICENSE` / `NOTICE` coverage.

## 12. Implementation sequence

Developer experience is an explicit implementation program:

### DX-0 — Contract and scaffolding

- define this architecture;
- define draft Agent Descriptor semantics;
- define common SDK surface and conformance expectations;
- establish language directories and documentation.

**Status:** architecture/documentation defined; SDK runtime implementation still open.

### DX-1 — Reference SDK pair

- TypeScript/JavaScript SDK;
- Python SDK;
- shared golden fixtures/conformance harness;
- local-node quickstart;
- Agent Descriptor parser/verifier;
- discover/offer/need/result core path.

### DX-2 — Enterprise/runtime parity

- Go SDK;
- Java SDK;
- C#/.NET SDK;
- parity against the same conformance fixtures;
- idiomatic cancellation/async/streaming support.

### DX-3 — Distribution and onboarding

- publish packages to npm, PyPI, Go module proxy-compatible source, Maven-compatible repository and NuGet;
- signed/tagged reproducible release process where practical;
- version/compatibility pages;
- copy-paste examples and sample apps;
- CI matrix across all five first-party languages.

### DX-4 — Stable SDK gate

Before TRUYN v1 stable:

- all five required SDKs pass the common conformance suite against the stable TRUYN/1 node;
- Agent Descriptor semantics are stabilized/versioned;
- compatibility/deprecation rules are documented;
- security negative tests are included in release gates;
- published package versions and documentation are reproducible from tagged source.

## 13. Non-goals

The SDK/DX layer does not:

- replace MCP or provider-specific adapters;
- make private providers public;
- store provider credentials in network descriptors;
- bypass node-side authorization/billing;
- require every application to run an embedded TRUYN node;
- turn dynamic `OFFER` state into static descriptor metadata;
- force one programming-language implementation style across ecosystems.

## 14. Acceptance criterion

TRUYN developer experience is considered broadly usable when a developer in any of the five required languages can, from public documentation alone:

```text
install one package
      ↓
connect to a TRUYN node
      ↓
discover/verify a participant descriptor
      ↓
find an authorized capability
      ↓
send NEED
      ↓
receive RESULT + identity/provenance/trust metadata
```

without reading TRUYN internals or implementing the wire protocol manually.
