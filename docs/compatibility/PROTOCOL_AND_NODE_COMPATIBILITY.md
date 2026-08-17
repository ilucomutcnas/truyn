# TRUYN Protocol and Node Compatibility

**Status:** pre-1.0 compatibility contract.

## Independent version axes

```text
software version  != protocol generation
protocol generation != wire schema/storage migration
```

Current repository state:

```text
software: 0.1.0-dev
protocol: TRUYN/1 (draft)
wire: proto/v1
network profiles: local / testnet / mainnet
```

`mainnet` is reserved but not productionized/stable.

## Node compatibility rule

A node should only claim compatibility with protocol/wire semantics it actually implements and validates. Unknown or unsupported protocol generations must not be treated as equivalent merely because transport connection succeeds.

Transport compatibility (for example QUIC reachability) is weaker than TRUYN semantic compatibility.

## Testnet policy

Testnet is allowed to evolve. Breaking changes may occur before stabilization, but they should be:

- explicit in source/spec/changelog;
- covered by tests/migrations where persisted state is affected;
- reflected in benchmark evidence when a measured protocol path changes;
- not silently presented as mainnet-stable behavior.

## Stable/mainnet gate

A stable `TRUYN/1` promise requires at least:

- normative protocol freeze/versioning rules;
- wire-schema compatibility rules;
- node capability/version negotiation behavior where needed;
- storage/config migration and rollback strategy;
- updater/release authenticity policy;
- cross-version interoperability tests;
- documented deprecation windows.

These are not all complete today.

## Security compatibility

Compatibility cannot weaken security. A legacy/bridge path that cannot preserve equivalent requester/provider authorization must fail closed rather than remain enabled solely for backward compatibility.

Likewise, older local-development behavior must not be accepted as production/public configuration.

## Evidence compatibility

Every significant benchmark should identify the tested commit/software/protocol assumptions. A later incompatible implementation must not silently reuse an earlier benchmark as if it measured the new behavior.
