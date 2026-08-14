# TRUYN/1 SUBSCRIBE

**Status:** draft normative skeleton.

`SUBSCRIBE` requests notification when a named capability/state/claim condition changes rather than repeatedly polling.

A subscription includes subscriber identity, selector/filter, policy constraints and expiry. Providers MAY reject unsupported filters or resource-intensive subscriptions.

Delivery events SHOULD reference the relevant `STATE`, `DELTA`, `OBJECT`, `CLAIM` or `RESULT` so that consumers can verify provenance and freshness.
