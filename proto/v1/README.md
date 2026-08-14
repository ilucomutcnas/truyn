# TRUYN/1 Protobuf Skeleton

These `.proto` files are the machine-readable draft wire schema corresponding to `spec/protocol/v1/`.

The normative semantics live in `spec/`; Protobuf is an encoding contract, not the source of architectural meaning.

Current top-level envelope payloads: `IDENTITY`, `OFFER`, `NEED`, `OBJECT`, `CLAIM`, `ATTEST`, `STATE`, `DELTA`, `SUBSCRIBE`, `COMPUTE`, `RESULT`, `TRUST_RECEIPT`, `REVOKE`.
