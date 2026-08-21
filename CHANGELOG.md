# Changelog

## [v0.3.0] - 2026-08-20

### Added

- Portal: a **Configs & logs** card on the agent page, directly above the Danger
  Zone. Downloads the agent's rendered configs, or its running logs, as a zip —
  all four components for a full stack, the VTA alone for a VTA-only agent.
- Admin: an **Export** column on the sessions table, offering the same two
  downloads for any user's session.

Both are offered only while a session is running, since both read its live
containers. Requires vtafarm-api 0.3.0.

## [v0.2.0] - 2026-08-19

### Breaking

- `imagePullSecrets` removed. The images are public, so nothing needs a pull
  secret; a values file still setting it is ignored from this version on.

### Removed

- `scripts/deploy.sh`, whose only caller was the deleted workflow.

## [v0.1.0] - 2026-08-19

First published release. Image and chart on GHCR.
