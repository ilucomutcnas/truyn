# TRUYN JavaScript / TypeScript SDK

**Status:** planned first-party SDK / repository scaffold.

This directory is reserved for the required JavaScript/TypeScript first-party TRUYN SDK.

Target distribution: **npm**.  
Target package name: to be finalized during implementation; examples currently use `@truyn/sdk` as a placeholder.

## Required core surface

- typed client configuration/connect;
- Agent Descriptor retrieval + verification;
- identity retrieval;
- authorization-aware discovery;
- `OFFER` publish/revoke;
- `NEED` submission + async/streaming/polling `RESULT` handling;
- deadlines/cancellation;
- content/artifact references;
- normalized errors and compatibility metadata.

## Implementation stage

This SDK is part of **DX-1**, together with Python. It should be one of the two reference implementations used to establish shared conformance fixtures before Go/Java/.NET parity work.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
