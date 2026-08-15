# TRUYN/1 DELTA

**Status:** draft normative skeleton.

`DELTA` conveys a change relative to an identified base state. It exists to avoid retransmitting a full state/object when both parties already possess the same verified base.

A delta MUST identify the base state and resulting state plus patch encoding/digest. A receiver MUST NOT apply a delta to an unknown or mismatched base.

Delta efficiency is workload-dependent and must be benchmarked; the protocol does not claim a universal compression ratio.
