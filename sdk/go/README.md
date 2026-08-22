# TRUYN Go SDK

**Status:** planned first-party SDK / repository scaffold.

This directory is reserved for the required Go first-party TRUYN SDK.

Target distribution: **Go module**.

## Required core surface

- context-aware client connect/configuration;
- Agent Descriptor retrieval + verification;
- identity retrieval;
- authorization-aware discovery;
- `OFFER` publish/revoke;
- `NEED` submission + async/streaming/polling `RESULT` handling;
- `context.Context` cancellation/deadlines;
- content/artifact references;
- normalized errors and compatibility metadata.

## Implementation stage

This SDK is part of **DX-2**, after the TypeScript/Python reference pair and shared conformance fixtures establish the common behavior.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
