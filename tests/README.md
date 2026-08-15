# Tests

Test suites are separated by unit, integration, interoperability, network, Trustability, security, and adversarial behavior so protocol claims can be validated independently.

## Provider-security acceptance matrix

The approved provider-ownership architecture is not considered implemented until automated/adversarial coverage proves at minimum:

```text
anonymous requester → owner-private provider
= denied; zero upstream provider calls

registered foreign node → owner-private provider
= denied; zero upstream provider calls

foreign node + known private provider ID
= denied

foreign node + forged owner/tenant fields
= denied

legacy HTTP/WebSocket/MCP execution route
= same central authorization decision

user → own BYOK provider
= allowed when valid

explicit shared entitlement
= allowed only within policy/quota

trusted owner requester → owner-private provider
= allowed within owner policy
```

The strongest assertion is not merely HTTP `403`; tests should prove that unauthorized attempts produce **zero chargeable upstream calls/tokens/jobs**.

## Fail-closed testing

Security tests should also cover missing/invalid provider policy, unresolved tenant, unresolved billing owner, unavailable mandatory quota state, expired sessions/replays and private discovery leakage.

## Credential hygiene

Tests should prefer deterministic/mocked providers. Paid external calls require an explicitly authorized private environment and must never print raw credentials/private keys.

See `../docs/architecture/THREAT_MODEL.md` and `../SECURITY.md`.
