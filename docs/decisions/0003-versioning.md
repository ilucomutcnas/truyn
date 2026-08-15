# ADR-0003 — Independent Version Domains

**Status:** Accepted.

TRUYN software versions, network protocol generations, wire schemas and storage schemas are versioned independently.

```text
software: v0.1.0, v1.0.0, ...
protocol: TRUYN/1, TRUYN/2, ...
wire: proto/v1, proto/v2, ...
storage/config: explicit migrations
```

A software release may support multiple protocol generations. The whole repository is never copied into version directories; only compatibility-sensitive contracts coexist side-by-side.
