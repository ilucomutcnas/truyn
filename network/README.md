# Network

Owns underlay-facing peer mechanics: QUIC/UDP transport, authenticated sessions, discovery, DHT/rendezvous, pub/sub, relay, NAT traversal and network-aware caching.

IP remains the transport underlay. Long-lived TRUYN identity, capability, object and trust semantics live above it.

Bootstrap/relay infrastructure MUST NOT become an authoritative global state service. Direct P2P is preferred when reachable; relays are fallback infrastructure.
