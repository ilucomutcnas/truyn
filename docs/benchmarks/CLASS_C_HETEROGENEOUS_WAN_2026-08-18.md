# TRUYN Class C Heterogeneous WAN Acceptance — 2026-08-18

Status: **ACCEPTED / PASS**

This report is the durable public evidence record for the accepted TRUYN Class C heterogeneous WAN/reachability gate. Operational resource names, privileged identities, secret-bearing endpoints and other live topology details are intentionally omitted. The measured acceptance result, run identity and artifact digest are preserved.

## Evidence

- GitHub Actions run: `32176189830`
- Tested commit: `ddea08d332373861390b72e1cf9d7d8a5311639d`
- Workflow run result: `SUCCESS`
- Artifact: `class-c-v14-32176189830`
- Artifact ID: `9339970986`
- Artifact size: `3984` bytes
- Artifact digest: `sha256:a085eadb6444775b9b4b2126a3698f48d683a77d935abe93da606b27c5d761a3`
- Raw proof outcome: `success`
- Normalized gate: `PASS`
- Cleanup gate: `PASS`

The temporary privileged workflow used to start the immutable run was removed from `main` immediately after the run was pinned. The accepted proof therefore executed against the immutable tested commit while the public default branch returned to the normal workflow allowlist.

## Gate contract

Class C was not accepted on a generic green job. The normalized acceptance step required all of the following:

1. at least two cloud providers and two cloud regions;
2. direct cross-cloud QUIC before fallback, with zero relay calls on that direct path;
3. a real packet-path partition that increments packet-drop counters and then heals;
4. a real Azure NAT gateway with the private node carrying no public IP and with the NAT source actually observed at the destination;
5. a two-layer double-NAT / CGNAT-like emulation whose inner node performs real outbound QUIC through the outer NAT layer;
6. authenticated relay fallback for a NAT-hidden target;
7. relay outage must fail closed;
8. relay recovery must restore the transaction path;
9. successful cleanup of ephemeral benchmark resources.

A missing field or unsuccessful proof/cleanup kept the normalized result at `FAIL`.

## Measured result

### Heterogeneous multi-cloud topology

- Cloud providers: **2**
- Cloud regions: **2**
- Real node runtimes in the proof: **4**
- GCP node runtime class: **Cloud Run**
- GCP compute VM required: **false**
- GCP network mutated: **false**
- Signed node identities created during bootstrap: **4**

Result: **PASS**.

### Direct cross-cloud QUIC

The proof established a real direct QUIC path from the GCP runtime to an Azure node before relay fallback was introduced.

- Cross-cloud direct QUIC: **true**
- Direction: **GCP Cloud Run → Azure**
- Relay calls on the direct path: **0**
- Isolated Azure virtual networks: **true**

Result: **PASS**.

### Packet-path WAN partition and heal

The benchmark inserted a packet-path UDP drop rule rather than merely changing application routing state. The negative request was blocked and the kernel packet counter increased.

- Actual packet drop exercised: **true**
- Dropped packets observed: **34**
- Heal latency: **513 ms**
- Direct QUIC succeeded again after rule removal: **true**

Result: **PASS**.

### Real Azure NAT gateway

The private NAT node had no public IP. It initiated outbound direct QUIC through the Azure NAT gateway, and the destination observed packets from the NAT source. A reverse direct path from an isolated peer was not available, establishing the required fallback condition.

- Private node public IP: **false**
- Outbound direct QUIC: **true**
- NAT source observed: **true**
- NAT packets observed: **20**
- Direct inbound from isolated peer: **false**
- Fallback required: **true**

Result: **PASS**.

### Double-NAT / CGNAT-like emulation

A second network namespace behind the already NATed Azure node created a real two-layer translation path. The inner TRUYN node started inside that namespace and issued outbound direct QUIC through the outer layer.

- NAT layers: **2**
- Inner-node outbound direct QUIC: **true**
- Outer NAT source observed: **true**
- Classification: **CGNAT-like emulation**

Result: **PASS**.

This result deliberately does **not** claim validation against a carrier-operated CGNAT field deployment. `carrierCgnatFieldValidated=false` remains part of the accepted evidence boundary.

### Authenticated relay fallback, outage and recovery

After the NAT-hidden target condition was established, the proof exercised the fallback path itself.

- NAT-hidden target: **true**
- Relay fallback: **true**
- Relay fallback authenticated: **true**
- Signed relay envelope: **true**
- Relay fallback latency: **70.503 ms**
- Relay outage fails closed: **true**
- Relay recovery: **true**
- Recovery latency: **325 ms**

Result: **PASS**.

### Cleanup

The benchmark cleanup stage completed after the accepted proof.

- `TRUYN_CLASS_C_CLEANUP=PASS`
- Ephemeral resources removed: **true**
- GCP network mutated by the proof: **false**

Result: **PASS**.

## Canonical normalized result

The final measured Class C payload was equivalent to:

```json
{
  "gate": "PASS",
  "testedCommit": "ddea08d332373861390b72e1cf9d7d8a5311639d",
  "realNodeRuntimes": 4,
  "cloudProviders": 2,
  "cloudRegions": 2,
  "gcpNodeRuntime": "cloud-run",
  "gcpComputeVmRequired": false,
  "gcpNetworkMutated": false,
  "peerLeaseLifecycleEvidence": "separate-ci-prerequisite",
  "crossCloudDirectQuic": true,
  "relayCalls": 0,
  "packetPathPartition": true,
  "packetDropCount": 34,
  "packetHealMs": 513,
  "realAzureNatGateway": true,
  "natSourceObserved": true,
  "natPacketCount": 20,
  "privateNatNodePublicIp": false,
  "doubleNatCgnatLikeOutbound": true,
  "carrierCgnatFieldValidated": false,
  "relayFallback": true,
  "relayFallbackAuthenticated": true,
  "relayFallbackMs": 70.503,
  "relayOutageFailClosed": true,
  "relayRecovery": true,
  "relayRecoveryMs": 325
}
```

## Peer-record lifecycle boundary

Autonomous signed peer-record renewal/gossip is a **separate CI prerequisite**, not a measurement silently inferred from this long cloud orchestration. The Class C run deliberately used an orchestration-safe peer TTL and emitted:

`peerLeaseLifecycleEvidence="separate-ci-prerequisite"`

The immutable preflight for the accepted V14 run executed the dedicated productionization tests for renewal, persistence-before-announcement and repair of a missed proactive renewal announcement. Those tests passed. This report therefore does not mislabel the long WAN orchestration itself as a renewal measurement.

## Corrections discovered before acceptance

The accepted run followed a sequence of rejected attempts that exposed orchestration defects rather than weakened network gates. The fixes included bounded Azure CLI process retry for a hosted-runner Python module deadlock, bounded mandatory guest package bootstrap retry, Linux-compliant veth names, persistent systemd ownership for the inner namespace node, and marker-based RunCommand evidence extraction. None of the Class C acceptance conditions was removed or reduced.

## What this result proves

Class C now proves that the current TRUYN network implementation can operate across heterogeneous Azure/GCP runtimes with direct cross-cloud QUIC, survive a real packet-path partition and heal, traverse a real cloud NAT, operate through a two-layer CGNAT-like topology, fall back to an authenticated relay when direct reachability is unavailable, fail closed during relay outage, recover after relay restoration, and clean up the ephemeral proof environment.

## What this result does NOT prove

This Class C result does not prove:

- carrier-field CGNAT behavior;
- 100-node scale acceptance;
- 1,000-node scale acceptance;
- randomized long-duration adversarial resilience;
- Internet-scale throughput or production SLO closure.

Those remain separate gates. The next required gate is the accepted **100-real-node Class D run** using the canonical evaluator and post-cleanup evidence requirement.
