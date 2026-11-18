# MovieBox Web — Dedicated Supabase Account Setup

## Connection status

Only the existing **MyKitchen** Supabase project is currently visible in the connected account. The separately created **moviebox-web** project must be accessible to the Supabase connection before the SQL migration can be applied and verified. Never deploy this schema to MyKitchen.

## Ready-to-apply database migration

`supabase/migrations/20261118_moviebox_user_backup.sql`

The migration creates one private JSONB backup per authenticated user in `public.moviebox_user_backup`, with:
- `user_id` referencing `auth.users.id`;
- a 512 KiB maximum JSON snapshot;
- `revision` and `updated_at` fields for safe backup versioning;
- PostgreSQL row-level security enabled;
- explicit self-only SELECT/INSERT/UPDATE/DELETE policies;
- no access for `anon`, and no service-role keys in the client.

## Next steps once the project becomes visible

1. Confirm the new Supabase project's ID and owner organization.
2. Verify the project's authentication settings and Site URL / redirect allow list for the Cloudflare Pages origin.
3. Run the migration against **moviebox-web only** and verify with SQL queries and Supabase security advisors.
4. Retrieve the public project URL and the **publishable key**. Keep any `service_role` and secret keys out of GitHub and browser code.
5. Implement the email magic-link sign-in UI, optional manual cloud backup/restore (initial sync), and a local-only guest mode.
6. Run tests with two test user accounts to verify one cannot read or overwrite the other's backup; verify backup and restore on separate devices.

## Important handling of local data

Guest data remains stored on the current device. Logging in should not silently overwrite existing cloud or local data. On first sign-in, the user must choose whether to upload their current device's collection or restore an existing cloud backup, with a preview and confirmation. Cloud backups might include stream URLs and watchlists, so they must be treated as private account data.
