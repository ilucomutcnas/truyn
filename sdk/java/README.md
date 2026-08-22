# TRUYN Java SDK

**Status:** planned first-party SDK / repository scaffold.

This directory is reserved for the required Java first-party TRUYN SDK.

Target distribution: **Maven Central-compatible package publication**.

## Required core surface

- idiomatic client/builder configuration;
- Agent Descriptor retrieval + verification;
- identity retrieval;
- authorization-aware discovery;
- `OFFER` publish/revoke;
- `NEED` submission + async/streaming/polling `RESULT` handling;
- timeout/cancellation support appropriate to the Java runtime;
- content/artifact references;
- normalized exceptions/errors and compatibility metadata.

## Implementation stage

This SDK is part of **DX-2**, with Go and C#/.NET, and must pass the same shared TRUYN conformance fixtures established by the reference SDK pair.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
