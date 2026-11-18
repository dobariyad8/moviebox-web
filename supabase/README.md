# MovieBox Web — Dedicated Supabase account sync

## Connected production project

- Supabase project name: `movieboxweb`
- Project ID: `nwbwlwfubsgjxroiqvum`
- Database URL: `https://nwbwlwfubsgjxroiqvum.supabase.co`
- Account page: `https://moviebox-web-d7u.pages.dev/account.html`
- Existing MyKitchen project is **not** used.

The migration was applied to this project and checked. `public.moviebox_user_backup` has RLS enabled and four per-user policies (SELECT, INSERT, UPDATE, DELETE). Supabase security advisors returned zero warnings at the time of implementation.

## Authentication setup (required in Supabase Dashboard)

Visit [Auth URL configuration](https://supabase.com/dashboard/project/nwbwlwfubsgjxroiqvum/auth/url-configuration). Set:
- **Site URL:** `https://moviebox-web-d7u.pages.dev`
- **Redirect URLs:** `https://moviebox-web-d7u.pages.dev/account.html`

Ensure **Auth → Providers → Email** is enabled. The `account.html` page requests a magic sign-in link with `signInWithOtp`. The email link redirects to the Account page and the Supabase client completes sign-in. Hosted Supabase email sending is rate-limited and may need a custom SMTP provider for heavier usage.

## Privacy model and scope

Guest mode works unchanged. `account.js` only backs up these localStorage keys, on explicit user confirmation:
- `moviebox-web-data-v1`: user-added media, saved library favorites, library playback history
- `moviebox-rust-watchlist-v1`: saved movie titles
- `moviebox-live-favorites-v1`: saved Live TV channels

The user must choose **Back up this device** or **Restore cloud backup**. Cloud backups may contain stream URLs; always obtain consent before uploading. No streaming access tokens, API tokens, player source health stats, authentication sessions, or EPG URLs are copied.

Backup is capped at about 488KB in the client, with an additional 512KiB database constraint. Cloud backup writes require a signed-in authenticated user, and the database RLS policy requires that `user_id = auth.uid()`. Changes are revision-checked to avoid silently overwriting a backup that has been replaced on another device; the user must refresh and decide again. Restore prompts before replacing local collections and tries to roll back localStorage writes if one fails.

## Verification remaining

Test in a browser after deployment:
1. Open `account.html`, send yourself a magic link and sign in. Confirm the link returns to `account.html`.
2. Save at least one movie/watchlist item and favorite channel. Back up the device after reviewing the confirmation.
3. Sign in as the same account on another browser/device. Before replacing its local collections, inspect counts and confirm restore.
4. Verify the same titles appear after restore.
5. Sign in with a different test email and confirm no access to the first account's cloud backup.
6. Test logout, failed network, and guest mode.

No automatic cross-device merge is implemented. Sync is **manual backup/restore by design** to avoid unexpectedly deleting or exposing existing local content.

## Dependencies

`account.js` imports the version-pinned browser Supabase client from jsDelivr at `@supabase/supabase-js@2.119.0/+esm`. A network connection to the CDN and Supabase is necessary. Only the public publishable key (safe for browsers) is included; no secret or service-role keys are committed.
