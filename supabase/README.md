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

Ensure **Auth → Providers → Email** is enabled. The `account.html` page supports email/password registration (`signUp`), normal login (`signInWithPassword`), requested password reset (`resetPasswordForEmail`), and setting a new password (`updateUser`). Supabase normally requires an email confirmation once on registration. After confirming, the same email/password works on each device without receiving a login link. Reset links redirect to the Account page; the URL must be allowlisted. Hosted Supabase email sending is rate-limited and may need a custom SMTP provider for heavier usage.

## Privacy model and scope

Guest mode works unchanged. `account.js` only backs up these localStorage keys, on explicit user confirmation:
- `moviebox-web-data-v1`: user-added media, saved library favorites, library playback history
- `moviebox-rust-watchlist-v1`: saved movie titles
- `moviebox-live-favorites-v1`: saved Live TV channels

The user must choose **Back up this device** or **Restore cloud backup**. Cloud backups may contain stream URLs; always obtain consent before uploading. No streaming access tokens, API tokens, player source health stats, authentication sessions, or EPG URLs are copied.

Backup is capped at about 488KB in the client, with an additional 512KiB database constraint. Cloud backup writes require a signed-in authenticated user, and the database RLS policy requires that `user_id = auth.uid()`. Changes are revision-checked to avoid silently overwriting a backup that has been replaced on another device; the user must refresh and decide again. Restore prompts before replacing local collections and tries to roll back localStorage writes if one fails.

## Verification remaining

Test in a browser after deployment:
1. Open `account.html`, create an account using email/password, and complete any required one-time email verification. Sign in with the same password on another device.
2. Save at least one movie/watchlist item and favorite channel. Back up the device after reviewing the confirmation.
3. Sign in as the same account on another browser/device. Before replacing its local collections, inspect counts and confirm restore.
4. Verify the same titles appear after restore.
5. Sign in with a different test email and confirm no access to the first account's cloud backup.
6. Test logout, failed network, and guest mode.

No automatic cross-device merge is implemented. Sync is **manual backup/restore by design** to avoid unexpectedly deleting or exposing existing local content.

## Dependencies

`account.js` imports the version-pinned browser Supabase client from jsDelivr at `@supabase/supabase-js@2.119.0/+esm`. A network connection to the CDN and Supabase is necessary. Only the public publishable key (safe for browsers) is included; no secret or service-role keys are committed.

## Password-based login update

MovieBox uses **email as login ID** and a password. New accounts may require one-time email verification as configured in Supabase Auth. Subsequent device sign-ins use email/password without magic links. The **Forgot password** action sends a recovery email only when requested, and recovery links must return to the allowlisted `account.html` URL. Cloud backup/restore remains optional and explicitly confirmed by the user.

## Automatic syncing (opt-in per device)

The frontend includes `cloud-sync.js`, a separate module shared across Home, Discover, Live TV, and Account. It uses the existing Supabase `moviebox_user_backup` table; no new database tables or secret keys are needed.

**Initial setup:** After signing in, open Account & Sync and select one option:
- **Start with cloud data** — review and confirm before replacing this device's local collections with an existing cloud backup
- **Start with this device** — review and confirm before setting/replacing the cloud backup with the data on this device

Once enabled on a device, updates to `moviebox-web-data-v1`, `moviebox-rust-watchlist-v1`, and `moviebox-live-favorites-v1` upload automatically after a short delay. The app also polls every 20 seconds when visible, checks when the window gains focus, and retries after reconnecting to the network. Sync runs while the web app is open; this is **not** guaranteed background syncing when the app is fully closed.

**Conflicts:** The engine uses the row's optimistic revision check to prevent overwriting a newer cloud backup. When both devices modify different items, a three-way merge applies independent additions, removals and changes. If the same item is changed in incompatible ways, it pauses syncing and displays a conflict warning. The user can turn sync off, inspect both copies, and choose a new starting copy to enable it again. Missing cloud backups or unexpected loss of saved local data also pause syncing as a safety measure.

**Scope and privacy:** Sync is opt-in separately for each browser/device. Guest users are never synchronized. Signing out disables active syncing for that session without deleting local files or the private backup. Cloud backups may include viewing history and saved media URL metadata, so the initial setup clearly asks for consent. The frontend never uploads API access tokens, login passwords, HLS streaming content, provider stream health statistics, or Auth tokens into the saved snapshot.

**Manual backup controls** are available when automatic sync is off; they are disabled while auto-sync is enabled to prevent bypassing revision/conflict protections.

### Test plan

1. Sign in on Device A; add a movie, save a Live TV channel, and choose **Start with this device**.
2. Sign in on Device B; choose **Start with cloud data** to avoid replacing its existing library unexpectedly.
3. Add distinct favorites on both devices. With both apps open, wait for sync or use **Sync now**; both additions should appear on both devices.
4. Delete a favorite on one device and confirm that removal appears on the other.
5. Modify the same saved object differently on both devices before they sync. The engine should pause rather than silently overwrite; use the Account page to resolve.
6. Disconnect Device A, change a favorite, reconnect, and confirm it retries while the app is open.
7. Test sign out and guest usage; ensure they don't modify cloud data.

**Important:** Full device/browser end-to-end testing, remote Cloudflare deploy verification, and authentication email delivery are still necessary before declaring production-ready real-time syncing.
