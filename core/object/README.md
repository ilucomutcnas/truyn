# Content-Addressed Objects

Core domain logic for immutable information addressed by cryptographic digest. Objects are location-independent and can be deduplicated/reused across providers. Mutable knowledge belongs in `STATE`, which may reference immutable objects and deltas.
