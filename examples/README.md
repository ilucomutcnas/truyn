# Examples

Runnable demonstrations live here. Every example must state whether it requires local mode, testnet, external model/API credentials, cloud identity, or mocked providers.

## Security rules for examples

Examples are public source code and MUST NOT contain:

- real API keys, private keys or client secrets;
- live private origins/backchannels;
- privileged cloud/service-account identity details that provide no user value;
- private provider node IDs/tenant allowlists;
- real quota/cost ceilings or billing identifiers;
- sensitive prompts, outputs or customer data.

Use placeholders for deployment-specific values.

## Paid-provider examples

A live provider example demonstrates adapter interoperability only. It does not make the provider account a public TRUYN resource.

Examples that call external providers must use credentials/identity supplied by the person running the example or an explicitly authorized private benchmark environment. BYOK is the default user model.

Until the provider-ownership/central-authorization security gate is implemented and passes negative tests, examples involving paid/private providers should run only in controlled environments.

See `../docs/getting-started/BYOK.md` and `../docs/architecture/THREAT_MODEL.md`.
