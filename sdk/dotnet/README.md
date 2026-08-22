# TRUYN C# / .NET SDK

**Status:** planned first-party SDK / repository scaffold.

This directory is reserved for the required C#/.NET first-party TRUYN SDK.

Target distribution: **NuGet**.

## Required core surface

- idiomatic async client configuration/connect;
- Agent Descriptor retrieval + verification;
- identity retrieval;
- authorization-aware discovery;
- `OFFER` publish/revoke;
- `NEED` submission + async/streaming/polling `RESULT` handling;
- `CancellationToken`/deadline support;
- content/artifact references;
- normalized exceptions/errors and compatibility metadata.

## Implementation stage

This SDK is part of **DX-2**, with Go and Java, and must pass the same shared TRUYN conformance fixtures established by the reference SDK pair.

Architecture: `../../docs/architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Quickstart target: `../../docs/getting-started/SDK_QUICKSTART.md`.
