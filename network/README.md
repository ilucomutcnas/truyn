# Network

Owns underlay-facing peer mechanics: QUIC/UDP transport, authenticated sessions, discovery, DHT/rendezvous, pub/sub, relay, NAT traversal and network-aware caching.

IP remains the transport underlay. Long-lived TRUYN identity, capability, object and trust semantics live above it.

Bootstrap/relay infrastructure MUST NOT become an authoritative global state service. Direct P2P is preferred when reachable; relays are fallback/coordination infrastructure.

## Provider execution boundary

Network reachability and provider authorization are separate concerns.

A public relay or reachable peer session does not authorize a requester to consume every provider reachable through the network. Execution-capable network paths must call the central provider-policy/authorization layer before dispatch.

Conceptually:

```text
network/session authentication
        ↓
discovery candidate
        ↓
central provider authorization
        ↓
billing/quota eligibility
        ↓
provider dispatch
```

Transport code must not contain a shortcut equivalent to `capability matched => execute`.

## Discovery privacy

Owner-private providers should be filtered from unauthorized discovery responses. This is defense in depth; authorization must still deny execution if a private provider ID is known through another source.

## Provider backchannel

Private/owner-funded provider runtimes should use authenticated machine-to-machine connectivity for task delivery. The exact cloud/edge topology is operational and is intentionally not documented in the public network contract.

## Legacy paths

HTTP relay endpoints, WebSocket fast paths, MCP gateways, SDKs and future native transports must converge on equivalent authorization before provider execution.

See:

- `../docs/architecture/RELAY_SECURITY.md`
- `../docs/architecture/AUTHORIZATION_MODEL.md`
- `../spec/protocol/v1/provider-policy.md`
