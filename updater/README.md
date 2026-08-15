# Updater

Owns the safe software upgrade contract for `truyn` / `truynd`.

Required responsibilities:

- signed release metadata/artifact verification;
- update channels (`stable`, future preview/test channels);
- software/protocol/storage compatibility preflight;
- migration checkpoints;
- daemon quiesce/restart;
- post-update health/interoperability checks;
- automatic/manual rollback policy;
- identity preservation across routine upgrades;
- recovery from interrupted upgrades.

Updater logic MUST NOT silently rotate node identity or bypass protocol compatibility rules.
