# Bootstrap

Bootstrap configuration exists to help a new node discover its first peers and, where necessary, relay connectivity.

Bootstrap nodes are **not** authoritative registries of identity, capability, claims, truth or provider entitlement. After initial discovery, normal peer discovery/routing continues.

A bootstrap node telling a requester that a provider exists does not authorize execution. Provider ownership/visibility/billing policy remains a separate decision at the routing/execution boundary.

`local` may use no public bootstrap. `testnet` and future `mainnet` use separate bootstrap sets and trust/operational policies.

Public bootstrap/testnet reachability never overrides a provider's private/default-deny policy.
