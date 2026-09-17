# B2B Sales Engine

Universal B2B sales intelligence, training, coaching and manager/employee execution platform.

## Source-of-truth status

This repository was created on 2026-09-17 to replace the previous ad-hoc/manual deployment workflow used by `tele2-sales-engine` on Vercel.

The current production application is being recovered from the existing Tele2 deployment and reconciled against the proven `CCGEDGARS/einsteins-ai-trainer` implementation. The goal is to preserve the latest Tele2-specific work while removing client-specific branding and turning the product into a universal B2B sales engine.

## Immediate recovery priorities

1. Preserve the current Tele2 production UI and Tele2-specific functionality.
2. Restore the missing browser authentication asset (`pin-auth.js`).
3. Restore/configure the server-backed authentication and shared-state database.
4. Establish tests for manager/employee authentication, role separation, persistence, and core navigation.
5. Connect this repository to the Vercel `tele2-sales-engine` project only after the recovered build passes verification.

## Architecture direction

- Company profile and knowledge layer adapt the entire platform to each customer.
- Separate Manager and Employee workspaces.
- Manager can assign tasks and monitor individual/team performance.
- Sales process, skills, scripts, role play, tests, recording analysis, coaching and deal intelligence are modular.
- GitHub is the source of truth; Vercel is deployment infrastructure, not the primary source store.

## Safety rule

Do not overwrite the current Tele2 production deployment until the recovered source has been tested in preview and verified against the live application.
