# TRUYN Python SDK

**Status:** planned first-party SDK / repository scaffold.

This directory is reserved for the required Python first-party TRUYN SDK.

Target distribution: **PyPI**.  
Target package/import name: to be finalized during implementation; examples currently use `truyn` as a placeholder.

## Required core surface

- client configuration/connect;
- Agent Descriptor retrieval + verification;
- identity retrieval;
- authorization-aware discovery;
- `OFFER` publish/revoke;
- `NEED` submission + async/streaming/polling `RESULT` handling;
- deadlines/cancellation;
- content/artifact references;
- normalized errors and compatibility metadata.

## Implementation stage

This SDK is part of **DX-1**, together with JavaScript/TypeScript. The pair establishes the first public SDK contract and shared conformance fixtures before Go/Java/.NET parity work.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
