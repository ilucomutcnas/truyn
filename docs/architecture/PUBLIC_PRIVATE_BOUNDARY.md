# TRUYN Public / Private Information Boundary

**Status:** approved documentation and architecture policy.

## Rule of thumb

> If information explains **how TRUYN should work**, it is generally public.  
> If information reveals **how a specific production installation is configured**, it is generally private operational data.

TRUYN security must remain valid even when an attacker knows the public architecture. Secrecy of architecture is not a security control. At the same time, the project does not need to publish unnecessary production topology or billing/security internals.

## Public by design

The public repository may contain:

- protocol semantics and schemas;
- provider ownership and authorization rules;
- BYOK architecture;
- default-deny/fail-closed behavior;
- generic provider adapter interfaces;
- logical capability taxonomy;
- generic cloud/deployment architecture;
- generic environment-variable names that reveal no sensitive identifier;
- artifact/result schemas;
- threat model and negative security tests;
- benchmark methodology and validated aggregate results;
- generic examples with placeholders;
- public service/domain names intentionally exposed to users.

## Private operational information

Do not intentionally publish:

- API keys, passwords, tokens, client secrets or private keys;
- production TRUYN identity private material;
- cloud service-account/managed-identity identifiers unless publication is explicitly required;
- WIF/OIDC provider strings and trust configuration where they expose operational identity topology;
- subscription, billing-account and internal tenant identifiers;
- private origin URLs or provider backchannel addresses;
- private bucket/container names;
- secret-manager/key-vault paths;
- real privileged caller/tenant allowlists;
- exact production quotas, cost ceilings, emergency thresholds and credit balances;
- internal firewall/WAF/bypass configuration;
- private deployment names and topology where disclosure provides no user value;
- incident details before appropriate remediation/disclosure;
- sensitive user prompts, outputs or customer data.

Some of these values may not be credentials by themselves. They are still withheld to minimize operational information leakage.

## Public identifiers

Some identifiers are intentionally public, for example a public domain name, published protocol version or public node/capability that its owner deliberately advertises. Public status must be a deliberate property, not an accidental consequence of infrastructure-as-code or a debug document.

## Repository examples

Public examples should use placeholders such as:

```text
<PROJECT_ID>
<SERVICE_ACCOUNT>
<PRIVATE_ORIGIN>
<PROVIDER_ID>
<OWNER_TENANT>
```

rather than documenting a live production value.

## History caveat

Removing an operational value from the current branch does not remove it from Git history, Actions logs, artifacts, forks or caches. If a previously published value is actually secret/credential material, it must be rotated and history/log cleanup evaluated separately.

Identifiers that are not credentials normally do not require emergency rotation solely because they were visible, but current documentation should still follow the disclosure boundary.

## Documentation review rule

Every public architecture/documentation change should ask:

1. Is this needed to understand or implement TRUYN?
2. Is this a stable protocol/architecture fact or a live deployment detail?
3. Would a placeholder preserve the same public value?
4. Could this reveal credentials, privileged identity, topology, quota or security-control internals?

When in doubt, publish the invariant and keep the live operational value private.
