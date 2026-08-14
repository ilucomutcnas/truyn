# TRUYN/1 Discovery

**Status:** draft architecture specification.

Discovery maps logical identities/capabilities/content availability to reachable providers without making bootstrap infrastructure authoritative for network truth.

A reference implementation may use DHT/rendezvous, peer exchange, pub/sub advertisements, relays and NAT traversal over existing IP/QUIC. Bootstrap nodes provide initial reachability/discovery only; they MUST NOT become the sole source of identity, trust or capability truth.

Capability discovery returns candidates. Routing/trust policy decides which candidates are acceptable.
