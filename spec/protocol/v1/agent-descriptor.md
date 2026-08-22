# TRUYN/1 Agent Descriptor

**Status:** draft discovery metadata specification.  
**Wire status:** not a new top-level TRUYN envelope kind.

The **TRUYN Agent Descriptor** is a signed, cacheable self-description document used to bootstrap interoperability with a TRUYN-facing agent, service or node.

It exists to answer a narrow discovery/onboarding question:

> What participant is this, which TRUYN protocol/interface versions can it speak, which capability classes does it intentionally expose in this view, and how can a compatible client begin an interaction?

It does not replace signed `OFFER` messages, provider authorization, billing/entitlement policy, routing, Trustability or dynamic availability.

## 1. Discovery

An HTTP-facing participant SHOULD make its public descriptor available at:

```text
https://<domain>/.well-known/truyn-agent.json
```

A participant MAY additionally provide:

- a descriptor through authenticated TRUYN-native discovery;
- a descriptor URL/content through direct configuration;
- a registry/catalog entry that resolves to a descriptor.

A participant that is not intended for public discovery is not required to publish a public HTTP descriptor.

## 2. Descriptor visibility

A descriptor is always a **view**, not an unconditional dump of every provider/capability known to the node.

A public descriptor MUST contain only information intentionally public to unauthenticated requesters.

An authenticated implementation MAY return a richer requester-scoped descriptor after authentication/authorization. Such a view MUST NOT reveal a private capability/provider that the same requester would be unable to discover under provider policy.

Descriptor discovery MUST NOT become an authorization bypass.

## 3. Required logical fields

A v1 descriptor contains the following logical fields:

- `schema` — descriptor schema identifier;
- `descriptorVersion` — version of the descriptor schema;
- `identity` — TRUYN participant/node identity or identity reference;
- `protocols` — supported TRUYN protocol generations;
- `interfaces` — one or more supported interaction interfaces, ordered by preference when relevant;
- `capabilities` — capability classes intentionally visible in this descriptor view;
- `issuedAt` — issuance time;
- `expiresAt` — expiry time;
- `signature` or `signatures` — integrity/authenticity proof bound to the TRUYN identity or an authorized descriptor-signing key.

Recommended fields include:

- `name`;
- `description`;
- `features`;
- `security`;
- `extensions`;
- `documentation`;
- `sdkHints` when useful and non-sensitive.

## 4. Capability entry

A capability entry SHOULD contain:

- stable capability ID;
- optional human-readable name/description;
- supported input media/content modes;
- supported output media/content modes;
- supported interaction modes such as request-response, async/polling or streaming;
- optional stable constraints that are safe to advertise.

A descriptor SHOULD NOT embed dynamic price, transient load, live quota, requester-specific entitlements or other rapidly changing provider-selection state. That belongs in `OFFER`/policy/routing state.

## 5. Interface entry

An interface entry SHOULD identify:

- interface type, for example `https`, `websocket`, `truyn-quic`, `mcp` or another registered extension;
- endpoint or endpoint reference when intentionally discoverable;
- optional protocol/binding version;
- optional content/serialization modes.

Private origins/backchannels MUST NOT be exposed merely because they exist operationally.

## 6. Security information

A descriptor MAY declare supported authentication/security mechanisms, but MUST NOT contain plaintext credentials, API keys, bearer tokens, provider secrets, private keys or long-lived secret-bearing URLs.

Security metadata is descriptive. Actual authorization remains server/node policy.

## 7. Signature semantics

A descriptor SHOULD be signed.

The verifier MUST be able to determine whether the signing key is:

- the participant's current TRUYN identity key; or
- a key explicitly delegated/authorized by that identity for descriptor signing.

A valid signature proves descriptor integrity and key binding. It does not prove capability quality, current availability, requester authorization or result truth.

Descriptors MUST be expiry-bound. Clients SHOULD reject expired descriptors unless an explicit offline/cache policy says otherwise.

## 8. Example

```json
{
  "schema": "truyn.agent-descriptor/v1",
  "descriptorVersion": "1",
  "identity": "truyn:node:example",
  "name": "Example Agent",
  "description": "Example public TRUYN participant",
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
  "issuedAt": "2026-08-22T00:00:00Z",
  "expiresAt": "2026-08-23T00:00:00Z",
  "signature": "example-signature-value"
}
```

The example is illustrative while TRUYN/1 remains draft; concrete signature encoding/schema serialization may evolve before stabilization.

## 9. Descriptor versus OFFER

| Concern | Agent Descriptor | `OFFER` |
|---|---|---|
| Bootstrap/self-description | primary | no |
| Protocol/interface compatibility | primary | secondary/not required |
| Public capability class | yes, if intentionally visible | yes |
| Dynamic provider availability | no | yes |
| Current price/capacity/conditions | no | yes |
| Authorization grant | never | never by itself |
| Routing candidate state | no | yes, after policy filtering |

Clients MUST NOT infer provider authorization merely because a capability appears in a Descriptor or `OFFER`.

## 10. Compatibility

Clients MUST inspect `descriptorVersion` and `protocols` rather than assuming that every descriptor has the latest schema or that every node supports the same TRUYN protocol generation.

Unknown optional fields/extensions SHOULD be ignored unless the extension declares different handling. Unknown required semantics MUST fail explicitly rather than being guessed.

## 11. Relation to SDKs

First-party SDKs SHOULD provide:

- descriptor retrieval;
- schema parsing;
- expiry validation;
- signature validation;
- protocol/interface selection;
- visibility-safe capability enumeration;
- clear errors for unsupported descriptor/protocol versions.

See `docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.
