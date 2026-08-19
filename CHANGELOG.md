# Changelog

## [v0.2.0] - 2026-08-19

### Breaking

- `imagePullSecrets` removed. The images are public, so nothing needs a pull
  secret; a values file still setting it is ignored from this version on.

### Removed

- `scripts/deploy.sh`, whose only caller was the deleted workflow.

## [v0.1.0] - 2026-08-19

First published release. Image and chart on GHCR.
