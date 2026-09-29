# Changelog

## [v0.9.1] - 2026-09-29

### Fixed

- Upgrade status views continue tracking failed upgrades through automatic
  rollback and clearly report whether the previous version was restored.
- Admin session resource settings and their actions use separate, left-aligned
  table columns.

Requires vtafarm-api 0.9.1.

## [v0.9.0] - 2026-09-27

### Added

- Admins can inspect per-component memory requests and limits, distinguish
  platform defaults from customized sessions, and safely apply changes to one
  or more running sessions.

### Fixed

- Full-stack and VTA-only progress indicators mark the stage where setup
  actually failed instead of always marking the final step.

Requires vtafarm-api 0.9.0.

## [v0.8.0] - 2026-09-27

### Added

- VTA-only creation can connect to an in-farm or external DID host and choose
  its mediator independently by entering the two DIDs. The destination is
  inspected and identified before the agent is created.
- For external DID hosting, the setup flow provides the generated `did.jsonl`,
  publication guidance and a validation step before provisioning continues.

### Removed

- Full Stack share-code controls and the share-code connection form. Custom
  connections now use DID-hosting and mediator DIDs directly.

Requires vtafarm-api 0.8.0.

## [v0.7.1] - 2026-09-25

### Fixed

- Upgrade dialogs show each VTA session name once in preview and progress rows.

Requires vtafarm-api 0.7.1.

## [v0.7.0] - 2026-09-23

### Added

- Users can edit the TOML configuration of each component in a running agent;
  admins can do the same for the platform stack. The editor checks TOML syntax
  before applying changes and shows the result of the component readiness check.

### Fixed

- Dialogs remain scrollable when their content exceeds the viewport.

Requires vtafarm-api 0.7.0.

## [v0.6.1] - 2026-09-21

### Changed

- User and admin interfaces now label **Live ACL** as **ACL**.
- ACL lists now show only Super Admin entries returned by the API.

Requires vtafarm-api 0.6.1.

## [v0.6.0] - 2026-09-21

### Added

- Users can link additional PNM administrators to a running agent from its
  detail page, inspect the cached VTA ACL and refresh it from the live VTA.
- Admins can inspect and refresh the platform stack's live VTA ACL from the
  Administrators card.

Requires vtafarm-api 0.6.0.

## [v0.5.0] - 2026-09-18

### Added

- Users and admins can link and unlink VTA Wallet identities from their Settings
  or Security page, then use a linked identity to sign in alongside their
  existing passkeys.
- Apache-2.0 licensing, contribution guidelines and a DCO check for pull
  requests.

### Changed

- Load tests now generate an ephemeral Admin DID for each run, so starting a
  test no longer requires entering one manually.

Requires vtafarm-api 0.5.0.

## [v0.4.0] - 2026-08-31

### Added

- Admin: a **Load testing** section for provisioning batches of 1–50 VTA-only
  sessions from a selected image. Run names are generated automatically and one
  Admin DID is applied to the batch.
- Each run has a dedicated detail page showing VTA names, session IDs,
  provisioning state, endpoints and errors, plus a live readiness check and
  one-action cleanup.

### Changed

- Load-test runs are listed in a compact table, and deleted runs disappear after
  cleanup. The Admin DID is kept only in the current form and cleared after
  submission.

Requires vtafarm-api 0.4.0.

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
