# Changelog

All notable changes to this project are documented in this file.

## v1.0.0 - 2026-02-11

### Added
- Release playbook in `RELEASE.md` with pre-deploy, deploy, post-deploy, and rollback steps.
- Automated production smoke test command: `npm run smoke:release`.
- New smoke script in `scripts/smoke-release.mjs` validating:
  - `/api/health`
  - key pages (`index`, `dashboard`, `configuracoes`, `vendas`, `financeiro`, `empresas`, `planos`)
  - response headers and critical content markers.

### Changed
- Company creation flow in `configuracoes.js`:
  - modal and handlers connected correctly
  - fallback from callable to `/api/empresa/create` when needed.
- Frontend rule for company limit:
  - `Nova Empresa` button now locks at `2/2` in `Configuracoes` and `Empresas`.
- HTML script versioning updated for cache busting in key pages.
- Global cache headers set to `no-store` for HTML, JS, and CSS in `firebase.json`.

### Fixed
- Sales modal status options with broken symbols/encoding.
- Sales period filter behavior (`hoje`, `7d`, `30d`) with date normalization.
- Corrupted text/accents by converting HTML files to UTF-8.
- Header/company name fallback logic to avoid showing generic placeholder (`Minha Empresa`) when a valid name exists.

### Security
- Storage rules hardened in `storage.rules`:
  - access scoped by company membership
  - write restricted to admin role
  - upload constraints by type and size
  - explicit deny-all fallback rule.
- Firebase Storage enabled for project `meumanager-b02b0` and rules deployed.

### Backend
- Company limit enforced server-side in `functions/index.js`:
  - max 2 companies per user
  - clear `resource-exhausted` error when limit is reached.
- API fallback endpoint now returns mapped HTTP errors for known `HttpsError` codes.

### Operational status
- Hosting, Functions, Firestore rules, and Storage rules prepared for production flow.
- Release smoke checks passing against production base URL.

