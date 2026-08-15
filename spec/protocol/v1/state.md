# TRUYN/1 STATE

**Status:** draft normative skeleton.

`STATE` identifies mutable knowledge at a point/version in time. State SHOULD reference immutable content-addressed objects when practical.

A state record includes a stable state/subject identity, version, digest/object reference, source, observation time, expiry/freshness information and signature.

Consumers MUST verify the referenced object/digest before accepting state content.
