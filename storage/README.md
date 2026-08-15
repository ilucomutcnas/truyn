# Storage

Local persistence for node identity metadata, claims, content-addressed objects, mutable state, trust evidence/receipts and cache indexes.

Storage schema versions are independent of TRUYN protocol generation. Migrations must preserve logical identity and provide rollback/recovery checkpoints when possible.
