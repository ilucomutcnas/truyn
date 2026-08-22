# TRUYN SDK Quickstart

**Status:** target developer experience. First-party packages are not yet published; examples below define the intended onboarding shape for the SDK implementation program.

TRUYN's first-party SDK program covers:

- JavaScript / TypeScript;
- Python;
- Go;
- Java;
- C# / .NET.

The goal is that a developer can join TRUYN without manually constructing envelopes or reading internal node code.

## Target flow

```text
install SDK
   ↓
connect to TRUYN node
   ↓
fetch/verify Agent Descriptor
   ↓
discover authorized capability
   ↓
send NEED
   ↓
receive RESULT
```

## Agent Descriptor

For HTTP-facing public participants, the planned well-known discovery path is:

```text
https://<domain>/.well-known/truyn-agent.json
```

The Descriptor is onboarding metadata, not an authorization grant. Private providers/capabilities remain hidden by provider policy and MUST NOT become public merely because a descriptor endpoint exists.

## TypeScript target

```ts
import { TruynClient } from "@truyn/sdk";

const client = await TruynClient.connect({
  node: "http://127.0.0.1:8787"
});

const descriptor = await client.agentDescriptor();
const providers = await client.discover("reasoning.general");

const result = await client.need({
  capability: "reasoning.general",
  input: { question: "What can TRUYN do?" }
});
```

## Python target

```python
from truyn import TruynClient

client = TruynClient.connect(node="http://127.0.0.1:8787")
descriptor = client.agent_descriptor()
providers = client.discover("reasoning.general")

result = client.need(
    capability="reasoning.general",
    input={"question": "What can TRUYN do?"},
)
```

## Go target

```go
client, err := truyn.Connect(ctx, truyn.Config{Node: "http://127.0.0.1:8787"})
if err != nil { /* handle */ }

descriptor, err := client.AgentDescriptor(ctx)
providers, err := client.Discover(ctx, "reasoning.general")
result, err := client.Need(ctx, truyn.NeedRequest{
    Capability: "reasoning.general",
    Input: map[string]any{"question": "What can TRUYN do?"},
})
```

## Java target

```java
TruynClient client = TruynClient.connect(
    TruynConfig.builder().node("http://127.0.0.1:8787").build()
);

AgentDescriptor descriptor = client.agentDescriptor();
List<Provider> providers = client.discover("reasoning.general");
Result result = client.need(
    NeedRequest.builder()
        .capability("reasoning.general")
        .input(Map.of("question", "What can TRUYN do?"))
        .build()
);
```

## C# / .NET target

```csharp
var client = await TruynClient.ConnectAsync(new TruynClientOptions
{
    Node = new Uri("http://127.0.0.1:8787")
});

var descriptor = await client.GetAgentDescriptorAsync();
var providers = await client.DiscoverAsync("reasoning.general");
var result = await client.NeedAsync(new NeedRequest
{
    Capability = "reasoning.general",
    Input = new { question = "What can TRUYN do?" }
});
```

The exact class/method names may change before package implementation. The semantic requirements do not: descriptor discovery, authorized capability discovery, `NEED`/`RESULT`, identity/provenance verification, cancellation/deadlines and normalized errors must be available across all required first-party SDKs.

## Security rule

SDK convenience never overrides node/relay/provider authorization.

```text
SDK request
   ↓
authenticate requester
   ↓
authorization-aware discovery
   ↓
billing/entitlement when applicable
   ↓
dispatch
   ↓
provider-host recheck
```

A malicious or modified SDK must not gain access to a private provider that the same requester could not use through another TRUYN transport.

## Current alternative before SDK publication

Until first-party packages exist, developers can use the current CLI, MCP compatibility surface, HTTP bridge, provider adapters and repository examples. See:

- `MVP_QUICKSTART.md`;
- `MVP_AI_INTEROP.md`;
- `BYOK.md`;
- `../../sdk/README.md`.

Architecture: `../architecture/SDK_DEVELOPER_EXPERIENCE.md`.  
Draft Descriptor semantics: `../../spec/protocol/v1/agent-descriptor.md`.
