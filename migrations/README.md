# Migrations

Explicit migration ownership for configuration, storage and protocol-adjacent local state.

Migrations MUST be versioned, testable and compatible with updater rollback policy. A migration MUST NOT silently rotate cryptographic node identity. Protocol-generation migration is negotiated compatibility work, not a blind local data rewrite.
