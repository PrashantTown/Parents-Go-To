# Supabase backend

Project: `https://tgkuiqkxhfqzrqeirppv.supabase.co` (Sydney region)

## How the website talks to the database

- `vendor/supabase.js` is the Supabase library (version 2.117.3, kept in the repo so the site does not depend on a CDN).
- `config.js` holds the project URL and the **publishable** key. These are meant to be public. Never put the secret (service_role) key in the website.
- `backend.js` does sign-in, loading data after sign-in, and saving. The feature files (`board.js`, `chat.js`, …) still call their own `read()` and `write()`. Those now go through `backend.js`, which sends only what changed to the database.
- All security is enforced by the database (row level security), not by the browser.

## 1. Run the database migrations

In the Supabase dashboard go to **SQL Editor**, click **New query**, paste one file, then click **Run**. Do each file once, in this order:

| File | Status |
|---|---|
| `migrations/20261009000000_initial_schema.sql` | done |
| `migrations/20261009010000_lock_down_functions.sql` | done |
| `migrations/20261009020000_connect_website.sql` | **run this next** |

Never edit a file that has already been run. Later changes come as new files.

## 2. Authentication settings

- **Authentication → Sign In / Providers → Email.** "Confirm email" is on, so new parents must click a link before they can sign in. Supabase's built-in email sender only sends **a few emails per hour**. While you are testing, you can turn "Confirm email" off. Turn it back on before launch, once real email (step 6) is set up.
- **Authentication → Multi-Factor.** Make sure **TOTP (authenticator app)** is enabled. It is on by default. Admins need it.
- **Authentication → URL Configuration.** Keep `http://127.0.0.1:5500/**` and `http://localhost:5500/**` in Redirect URLs while testing.

## 3. Make the first admin

1. Open the site and create a normal account, for example with your own email.
2. In the SQL Editor, run:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

3. Sign out, then sign in again with **Administrator** selected.
4. The first time, a QR code appears. Scan it with Google Authenticator, Microsoft Authenticator or a password manager, then type the 6-digit code. From then on, admins only need the code.

Admin powers in the database only work after the authenticator code. A password alone is treated as a parent.

## 4. What is in the database

| Area | Tables |
|---|---|
| Accounts | `profiles` (name, role, status, settings) |
| Shelf | `children`, `books` (shelf and wishlist), `reading_sessions`, `activity` |
| Sharing | `wishlist_shares`, `family_members` |
| Community | `board_posts`, `reviews`, `suggestions`, `resources` |
| Chat | `chat_threads`, `chat_members`, `chat_messages` |
| Alerts | `notifications`, `push_subscriptions` |
| Support | `support_tickets`, `subscribers` |
| Admin | `audit_log`, `platform_settings` |

Storage buckets: `avatars`, `support-attachments` (both private).

Security rules in short:

- Parents see and change only their own shelf. Carers who accept an invite can read it.
- Admins moderate and handle support, but cannot see families' children or shelves.
- New posts, reviews and suggestions are checked by the database. With "Hold everything for review" switched on (the default), they wait for an admin. With it off, the same rules the site used before still apply: posts that name a person or link to an unknown site are held.
- Authors get a notification when an admin decides on their post.
- Only admins can change a role or suspend an account. Suspended accounts cannot sign in or post.

## 5. Test it locally

Open `reading-for-pleasure.html` with VS Code Live Server (`http://127.0.0.1:5500`). Things to try:

- Create an account, add a child and a book, refresh the page: everything should still be there.
- Sign out and back in.
- Post on the message board, then approve it from the admin console.
- Send the contact form on `contact.html`: you get a `PTG-####` reference, and the message appears in the admin console.
- Share the wishlist and open the link in a private window.

## 6. Email (needs the client's domain)

Without this, Supabase's limited built-in sender handles sign-up and reset emails, and no other emails are sent.

1. Create a free account at [resend.com](https://resend.com) and verify the client's domain (Resend shows the DNS records to add).
2. **Sign-up and password emails:** in Supabase go to **Authentication → Emails → SMTP Settings** and enter Resend's SMTP details. The sender is `no-reply@clientdomain`.
3. **Emails for contact messages and family invitations:** use the `notify-email` function (step 7).

## 7. Server functions (optional extras)

Two functions are in `supabase/functions/`. To add each one:

1. Go to **Edge Functions**, then **Deploy a new function**, then **Via Editor**.
2. Use the folder name as the function name (`notify-email` or `send-push`), paste the `index.ts` file, then click **Deploy**.
3. Open the function's settings and turn **off** "Verify JWT". The webhooks use a secret header instead.

Add the settings under **Edge Functions → Secrets**:

| Secret | Value |
|---|---|
| `WEBHOOK_SECRET` | any long random text |
| `RESEND_API_KEY` | from Resend |
| `FROM_EMAIL` | `Parents Go To <hello@clientdomain>` |
| `TEAM_EMAIL` | where contact messages should go |
| `SITE_URL` | `https://clientdomain/reading-for-pleasure.html` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | run `npx web-push generate-vapid-keys` |
| `VAPID_CONTACT` | `mailto:hello@clientdomain` |

Then go to **Database → Webhooks** and create three webhooks. Each one fires on **Insert**, has the type **Supabase Edge Functions**, and adds an HTTP header `x-webhook-secret` set to your `WEBHOOK_SECRET`:

| Table | Function |
|---|---|
| `support_tickets` | `notify-email` |
| `family_members` | `notify-email` |
| `notifications` | `send-push` |

For push notifications, also put the **public** VAPID key in `config.js` as `vapidPublicKey`.

## 8. Before launch

- Upgrade to the **Pro** plan: no pausing, daily backups, and "Leaked password protection".
- Turn on **Leaked password protection** (Authentication → Attack Protection).
- Turn "Confirm email" back on.
- **Authentication → URL Configuration:** set the Site URL to the client's domain, add `https://clientdomain/**` to Redirect URLs, and remove the localhost entries.
- Check **Advisors → Security Advisor**. The remaining warnings should only be about the functions the website is meant to call.

## Not built yet

- Carers can accept a family invitation (the database then lets them read that family's shelf and join chats the parent adds them to), but there are no screens yet for carers to see the shelf or open those chats.
- "Sign in with Google/Facebook" buttons still say they are not connected.
- "Keep me signed in" is always on: sessions are remembered until sign-out.
- The CSS and JavaScript files are not bundled or minified yet.
