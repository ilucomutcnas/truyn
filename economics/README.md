# Economics

Optional capability-economy implementation area.

The base network can route using price/cost metadata without requiring settlement. Future modules can support accounting, price discovery and settlement adapters while preserving protocol neutrality.

TRUYN's protocol position is **settlement neutrality**: no core currency, billing provider, blockchain, smart contract or mandatory settlement rail.

The first planned adapter targets are:

- **x402** for machine-native payment requirement, verification and settlement flows;
- **AP2** for verifiable agent payment authorization through mandates/receipts.

They may be composed, but neither is a TRUYN/1 dependency and implementation has not started.

See:

- `spec/protocol/v1/economics.md`
- `docs/architecture/SETTLEMENT_ADAPTERS.md`
- `docs/architecture/BILLING_BOUNDARY.md`

Primary economic measurements belong in `benchmarks/`: token reduction, avoided inference calls, latency, bandwidth, storage/transfer overhead and total useful machine cooperation per unit of cost/compute.
