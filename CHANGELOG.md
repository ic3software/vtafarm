# Changelog

## [v0.12.3] - 2026-10-09

### Added

- The user login page carries a demo-site notice, warning that the site may be
  torn down or stop accepting new agents, and links to the `vtafarm-k8s`
  deployment code for running your own instance.
- Image pickers advise staying with the default `latest` image unless told
  otherwise.

### Changed

- The portal talks about **Trust Agents** and **Verifiable Trust Communities**
  rather than raw `vta_only` / `full_stack` identifiers: agent lists, mode
  badges, setup phases, and the create flow all use the member-facing names.
- Agent creation presents **Personal Trust Agent** and **Verifiable Trust
  Community (VTC)** as the two options, and names the connection choice after
  the messaging service it points at.
- Agent and community name fields start empty with example placeholders, and
  creation reports a clear error when either is left blank.
- Wallet sign-in is now the **VTA Browser Plugin**, with a link to the plugin
  repository when it isn't enabled for the site.
- The user and admin login asides lead with creating and managing your Trust
  Agent or Verifiable Trust Community, replacing the earlier tagline and
  feature strips.
- **Domains** appears in the sidebar only for accounts with Fullstack Access,
  since custom domains apply to VTCs.

Requires vtafarm-api 0.12.1.

## [v0.12.2] - 2026-10-05

### Changed

- The public site and portal now use the VTA Farm red accent palette across
  light and dark themes, including the favicon and interface highlights.
- The landing page promotes **Create account** as the primary action and uses
  the clearer **Login** label for returning users.

Requires vtafarm-api 0.12.1.

## [v0.12.1] - 2026-10-05

### Added

- Keyring download dialogs display scannable QR codes for iOS TestFlight and
  Google Play.
- PNM downloads support macOS and show platform-specific terminal instructions
  in dialogs, with a button to copy the commands.

### Changed

- Linux PNM downloads use the latest release link, and setup instructions run
  the downloaded executable with `./pnm setup`.

Requires vtafarm-api 0.12.1.

## [v0.12.0] - 2026-10-05

### Added

- Agent lists show VTA usage and account limits; creation dialogs explain how
  to free a slot when the two-VTA limit is reached.

### Changed

- Admin user controls now label **Beta Access** as **Fullstack Access**, granting
  unlimited VTAs and Full Stack creation. Only users with access see Mode
  selection.

Requires vtafarm-api 0.12.0.

## [v0.11.3] - 2026-10-04

### Changed

- Setup and running-agent pages now share the same Keyring and PNM connection
  controls, progress presentation, and responsive detail navigation.
- Agent lists use mobile-friendly cards, while settings, domain guidance, and
  version-loading states use simpler responsive layouts.

### Fixed

- Expired Keyring requests no longer restore a stale QR code after refreshing;
  users are prompted to generate a new code instead.
- Setup phases and completion actions remain consistent between creation and
  in-progress detail pages.

Requires vtafarm-api 0.11.1.

## [v0.11.2] - 2026-10-04

### Added

- Running agent pages organize day-to-day controls into **Overview**,
  **Connections**, **Credentials**, and **Settings** tabs, with a larger live
  console and focused detail panels.
- The Admin Platform Stack page now mirrors the agent detail experience with a
  live VTA console, administrator management, credentials, version controls,
  configuration exports, and a guarded danger zone.

### Changed

- **Connect with Keyring** is the recommended default connection method, while
  local setup is consistently labeled **Connect with PNM**.
- Expired Keyring QR codes clearly show their expired state, replacement
  action, and countdown immediately below an active code.
- Completed setup progress is hidden once an agent is running, and settings,
  credentials, consoles, and configuration details use simpler responsive
  layouts.

### Fixed

- ACL refresh feedback now appears beside the connected-device list instead of
  at the bottom of the connection form.
- Creation and provisioning pages remove duplicate status labels and
  nonessential setup output after the stack is online.

Requires vtafarm-api 0.11.0.

## [v0.11.1] - 2026-09-30

### Fixed

- Running agent pages no longer repeat the initial **Connect to your VTA**
  card above the separate controls for connecting another device.
- Agent creation remains on **Deploy VTA** until the API confirms the VTA is
  ready, preventing a premature running state and **Open agent** action.

Requires vtafarm-api 0.11.0.

## [v0.11.0] - 2026-09-30

### Added

- Initial setup and running VTA pages can connect administrators through local
  PNM setup, a manual mobile QR flow, or Automatic Mobile Connection.
- Automatic Mobile Connection displays a generated QR code, restores active
  requests, reports connection progress, and supports expired-code replacement.

### Changed

- The shared connection interface keeps pending mobile requests available when
  switching methods and removes the setup form after connection succeeds.

Requires vtafarm-api 0.11.0.

## [v0.10.0] - 2026-09-30

### Added

- Admin Resource Defaults page for editing component memory requests and
  limits, restoring factory defaults, and viewing full-stack totals.
- Success and information alerts for saved and restored defaults.

### Changed

- Memory resource controls support values from 16Mi to 1Gi and validate that
  requests do not exceed limits, including when editing existing sessions.

Requires vtafarm-api 0.10.0.

## [v0.9.3] - 2026-09-29

### Changed

- DID Hosting enrollment requires a claim code and no longer presents
  link-only invitations from older images.

Requires vtafarm-api 0.9.4.

## [v0.9.2] - 2026-09-29

### Added

- DID Hosting enrollment prompts display and copy the claim code required by
  current daemon images before opening the single-use enrollment link.

Requires vtafarm-api 0.9.2.

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
