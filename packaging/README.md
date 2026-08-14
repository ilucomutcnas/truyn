# Packaging

Distribution metadata for package managers and release artifacts (Homebrew, winget, deb/rpm, containers and future channels).

Published artifacts should have checksums/signatures and feed the `updater/` verification/rollback contract. Packaging must not silently alter node identity or network mode.
