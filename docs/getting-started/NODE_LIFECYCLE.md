# TRUYN Node Installation and Lifecycle

**Status: architectural contract; installers and streamlined BYOK onboarding are not yet production-ready.**

TRUYN installs a **Node** on an ordinary computer. It does not install an AI model and it does not replace the operating system's network stack.

## Intended components

- `truyn` — user-facing CLI.
- `truynd` — background node/daemon.
- local configuration/database/cache.
- cryptographic node identity.
- adapters/SDK endpoints used by agents and applications.
- optional user-owned/BYOK provider connections.

## First install

```text
1. Detect OS and CPU architecture.
2. Download/select the correct signed release artifact.
3. Verify release signature/checksum.
4. Install `truyn` and `truynd`.
5. Create the TRUYN application-data directory.
6. Generate a new node identity or import an existing identity.
7. Store private key material in OS secure storage/keychain where available.
8. Create configuration and initialize local storage schema.
9. Select a network profile: local, testnet or mainnet.
10. Register `truynd` as a background service when supported.
11. Optionally configure/test one or more BYOK providers owned by the user.
12. Load bootstrap peers for testnet/mainnet; local mode may require none.
13. Establish authenticated peer sessions.
14. Expose local adapter/SDK endpoints according to policy.
15. Publish only capabilities/provider visibility explicitly allowed by local policy.
16. Report node/provider status.
```

Intended CLI shape:

```bash
truyn install
truyn setup
truyn start --network local
truyn start --network testnet
truyn start --network mainnet
truyn status
truyn peers
truyn identity
truyn capabilities
truyn providers
truyn trust
truyn stop
```

Commands are interface targets until implemented and tested.

## BYOK lifecycle

TRUYN is BYOK by default: Bring Your Own Intelligence / Bring Your Own Provider.

A provider configured by a normal user is private/self-scoped by default. The user must explicitly choose to share/publish it under a wider access policy.

The official client may require at least one successfully configured own provider before enabling AI requester workflows. That is a UX/product guardrail; authoritative provider authorization remains server-side so a custom client cannot bypass ownership policy.

See `BYOK.md`.

## Runtime data

Logical layout:

```text
~/.truyn/
├── config.toml
├── identity/
├── objects/
├── state/
├── claims/
├── trust/
├── cache/
├── peers/
├── adapters/
├── logs/
└── db/
```

Secrets MUST NOT be assumed to live as plaintext files. Node private keys and provider credentials should use platform keychains/secure storage or equivalent provider/runtime secret facilities when practical.

Raw provider credentials are not part of TRUYN protocol envelopes or relay discovery state.

## Upgrade

A safe updater should:

1. fetch signed release metadata;
2. verify artifact authenticity;
3. check software/protocol/storage compatibility;
4. create migration/rollback checkpoints;
5. stop or quiesce the daemon safely;
6. install the new binary;
7. run required migrations;
8. restart and perform health/interoperability/security checks;
9. automatically rollback when policy-defined critical checks fail.

Provider ownership/visibility policy and credential references must survive normal upgrades without silently broadening access.

## Identity persistence

Routine software upgrades MUST NOT silently create a new node identity. Identity rotation/recovery/revocation must be explicit and auditable.

Provider runtime identity rotation must likewise avoid silently changing ownership/authorization semantics.

## Uninstall

Uninstall should distinguish binaries/service registration from user-owned identity/state/provider credentials. Destructive removal of identity/private material must require explicit intent.
