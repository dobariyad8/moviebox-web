# MovieBox Web — Production Readiness Checklist

Updated November 18, 2026.

## Current verified facts

- **Supabase project:** `nwbwlwfubsgjxroiqvum` (MovieBox Web). The project is distinct from MyKitchen.
- **Backup table:** `public.moviebox_user_backup`, PostgreSQL RLS enabled.
- **Access:** `anon` has no SELECT privilege; `authenticated` may SELECT subject to owner-only RLS; four owner-specific SELECT, INSERT, UPDATE and DELETE policies are present.
- **Supabase security advisor:** warning remains: **Leaked Password Protection Disabled**. Follow [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- **Supabase performance advisor:** no findings as of review.
- **Render backend:** latest listed deployment was live; **an end-to-end /api/health HTTP response was not verified** in this environment.
- **Cloudflare Pages:** the site is expected at `https://moviebox-web-d7u.pages.dev/`; **the current production HTML/JS has not been independently loaded and verified** by this review.

## Improvements made

1. **Regression tests**: `tests/cloud-sync.test.cjs` covers upload, restore, distinct edits, conflicts, cloud deletion, local data deletion, and metadata-only polling.
2. **GitHub Actions**: `.github/workflows/frontend-check.yml` runs `node --test tests/cloud-sync.test.cjs` as well as JavaScript syntax checks. Check the Actions UI for the actual run conclusion.
3. **Bandwidth**: `cloud-sync.js` now polls a small `revision` field every ~20 seconds while the app is open and downloads the JSON snapshot only when changes occur. Streaming content and tokens are never included in the backup snapshot.
4. **Sync visibility**: Home, Discover and Live TV show a compact **Synced / Syncing / Sync paused** status link when automatic sync is enabled; clicking it opens Account & Sync.
5. **Privacy**: auto-sync remains opt-in on each device, and local data is not replaced until the user chooses the starting copy on that device.

## Required browser tests

- [ ] **Supabase Auth redirect configuration**: allow `https://moviebox-web-d7u.pages.dev/account.html`; enable email/password sign-in, and verify one-time signup confirmation when enabled
- [ ] **Password protection**: enable leaked-password checking under Supabase Auth security settings if supported on the project's plan; consider stronger password requirements
- [ ] **Account A**: register, verify email and sign in; sign out and sign in again without requesting another link
- [ ] **Device A**: save a movie title and Live TV favorite, visit Account & Sync and select **Start with this device**
- [ ] **Device B**: sign in to the same account, select **Start with cloud data** and verify saved entries appear
- [ ] **Bidirectional sync**: add different favorites on A and B; keep app pages open; verify both devices converge and status says Synced
- [ ] **Conflict**: edit the same saved item differently on both devices while temporarily offline, reconnect and confirm one device pauses rather than overwrites
- [ ] **Privacy**: sign in using an unrelated account B and verify that account cannot view account A's backup
- [ ] **Guest mode**: sign out and confirm saved local content remains usable without cloud access
- [ ] **VLC and HLS**: verify browser Live TV playback and the device-specific VLC handoff on desktop and mobile
- [ ] **PWA**: install on Android/iPhone where supported; verify no false expectation of offline streaming
- [ ] **GitHub CI**: verify the latest Frontend JavaScript syntax workflow has completed successfully
- [ ] **Cloudflare**: verify the expected commit is deployed and that `account.html`, `cloud-sync.js`, `sync-status.js` return without errors

**Important:** passing local simulation or database policy inspection does not prove live authentication or multi-device sync is production-ready. Do not treat this as a completed real-device acceptance test until the checklist is performed.
