# Bring Your Own Intelligence (BYOK)

**Status:** target onboarding contract. The streamlined setup flow described here is planned; it is not claimed as fully implemented by this documentation-only change.

TRUYN is designed around **BYOK — Bring Your Own Intelligence / Bring Your Own Provider**.

A public TRUYN network does not provide arbitrary users with another party's paid AI credentials or provider quota.

## Target user flow

The intended user experience is:

```text
truyn setup
```

Choose a provider class:

```text
OpenAI
Anthropic / Claude
Google / Gemini
Azure OpenAI
OpenAI-compatible
Local model
Custom HTTP / MCP agent
```

Then:

```text
enter/configure credential locally
select or discover model
run connection test
publish private/self capability
ready
```

Common-provider setup should not require editing GitHub Secrets, CI workflows or cloud infrastructure.

## Credential rule

Your provider credential belongs to your provider runtime. It should not be sent to the TRUYN relay in `IDENTITY`, `OFFER`, `NEED`, `RESULT` or discovery messages.

Preferred storage is the OS credential/key store or an equivalent secure secret facility.

## Provider visibility

A newly connected provider is private/self-scoped by default. Making a provider available to other users must be an explicit action with an explicit sharing/commercial policy.

## Current MVP note

Some current MVP/live-demo commands still accept provider credentials through local environment variables. That proves adapter interoperability; it is not the final onboarding/storage UX.

Use only credentials you control, in trusted local/test environments, until the planned BYOK setup and provider-ownership security gate are implemented.

## Security invariant

Even after the official client gains a BYOK setup gate, server-side authorization remains mandatory. A modified client must not be able to consume a private provider owned by somebody else.

See:

- `../architecture/BYOK_ARCHITECTURE.md`
- `../architecture/PROVIDER_OWNERSHIP.md`
- `../architecture/AUTHORIZATION_MODEL.md`
