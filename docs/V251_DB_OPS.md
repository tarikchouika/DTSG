# v2.51 — Database & Ops Note (for the DB assistant / owner)

Date: 2026-09-21 · Delivery: patch on `main` (single-branch policy —
no feature branches; the temporary `arena/*` branch was deleted).

## Short answer: NO database action needed for v2.51

This release is **static frontend only** (CSS / JS / HTML / docs).
It touches **no** Worker code, **no** D1/SQLite schema, **no** KV, **no** API routes.

- Wallet change = client-side dedup filter in `js/wallet.js` (hides the
  duplicate "Binance" top-up tile when "Binance Pay" manual option exists).
  Payment methods, review queues and balances served by the backend are
  unchanged — `_cf_payments_test.js` still 102/102 green.
- Domino change = board layout/positions only (`dominoes-game/` + one CSS
  section). The classic full-felt design is untouched (`dominoes.css` and
  `21-classic.css` have zero changes).
- Chat change = CSS overflow fix in `css/09-chrome.css`.

## Checklist for the DB assistant

- [ ] Nothing to migrate: **no new tables, no ALTERs, no seed changes**.
- [ ] Nothing to restart: Cloudflare Pages serves static files; Workers/D1
      untouched by this deploy.
- [ ] No config change: no new secrets, bindings, or environment variables.
- [ ] If you run a local SQLite copy for testing: no import needed; you may
      smoke-test the preview URL (domino R/T badge, single Binance tile,
      unclipped chat) — read-only check.

## Deploy tracking

- Preview (this release, for owner review): direct-upload preview on the
  `dtsg` Pages project from the owner's machine (the dev sandbox cannot
  reach Cloudflare). `--branch` here is only a preview label, NOT a git
  branch — e.g. `--branch preview-v251` →
  `https://preview-v251.dtsg.pages.dev`.
- Production `https://dtsg.pages.dev` is **NOT** touched by this release.
  Promote only after the owner approves the preview.

## Rollback

Static-only: rollback = redeploy the previous production deployment from the
Cloudflare dashboard (Deployments → previous → Rollback), or re-deploy `main`.
No DB rollback possible or needed.
