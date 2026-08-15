# TRUYN/1 Discovery

**Status:** draft architecture specification; full authorization-aware discovery is not yet an implementation claim.

Discovery maps logical identities/capabilities/content availability to reachable providers without making bootstrap infrastructure authoritative for network truth.

A reference implementation may use DHT/rendezvous, peer exchange, pub/sub advertisements, relays and NAT traversal over existing IP/QUIC. Bootstrap nodes provide initial reachability/discovery only; they MUST NOT become the sole source of identity, trust or capability truth.

## Discovery does not grant execution access

Capability discovery returns **candidates**, not entitlements.

A requester may only receive/use providers allowed by provider ownership/visibility policy. Implementations SHOULD filter owner-private providers from unauthorized discovery results and MUST still enforce execution authorization if a private provider ID is learned through another channel.

The target flow is:

```text
capability index / advertisements
          ↓
requester identity / tenant context
          ↓
visibility / ownership filter
          ↓
discoverable candidate set
          ↓
routing authorization + constraints
```

## Metadata minimization

Discovery responses should expose only metadata needed for capability selection and verification. Private origins, cloud account identifiers, secret paths, privileged policy details and other unnecessary operational data are not discovery fields.

## Public providers

A provider can intentionally opt into broader `shared` or `network` visibility under an explicit policy. Public discoverability is a provider-owner decision; connecting to a public relay does not automatically publish a provider.

Routing/trust policy decides which discoverable authorized candidates are acceptable for the request.
