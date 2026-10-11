<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All ledger data lives on-device in `src/lib/ledger.ts` (localStorage, no backend) — the app must work fully offline and never send financial data anywhere.
- Customer balances are always derived from opening balance + non-deleted transactions — never store a separate balance, so ledger and balance can't drift.
- Deletes are soft (`deletedAt`) with an audit entry — preserves a trail and lets backups merge by ID without duplicates.
- The app is a single route with in-page tabs — so every screen is available offline after the first visit.
- Service worker is registered only via `src/lib/pwa.ts` — keeps it out of the editor preview.
- Android app is Capacitor (`capacitor.config.ts`, committed `android/` project); in the app, SQLite (`src/lib/sqlite-store.ts`) is the source of truth with append-only migrations — real on-device database that survives restarts and updates.
- APKs are built only by `.github/workflows/android.yml` using `CAPACITOR=1` (TanStack SPA shell → `www/`) — the editor can't run the Android SDK; release signing comes solely from GitHub secrets.
