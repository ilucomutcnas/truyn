# Benchmarks

TRUYN benchmark methodology may be public; privileged execution infrastructure is not.

Public benchmark material may include:

- workload definition and evaluation rubric;
- protocol/capability semantics;
- aggregate validated measurements;
- generic model/provider family labels where useful;
- formulas and price assumptions;
- reproducibility instructions that use local/mock/BYOK providers.

The public repository must not contain raw production evidence that exposes operational infrastructure, including GitHub Actions run/artifact identifiers, private deployment/resource names, cloud identity topology, internal origins, buckets, private route names, quota/cost ceilings, privileged allowlists, or credential-bearing execution instructions.

Production/raw evidence belongs in access-controlled operational storage. A public report is created only after security review and redaction.

Measurement areas include latency, throughput, bytes, token use, inference cost, context/object reuse, trust verification, failure recovery, and local resource overhead.

Core economic metric:

> useful, trustworthy machine cooperation per dollar, per second and per unit of compute.

No result is a security entitlement: publishing that a project-controlled provider participated in a benchmark never grants public access to that provider or its billing account.
