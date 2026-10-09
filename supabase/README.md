# Supabase backend

Project: `https://tgkuiqkxhfqzrqeirppv.supabase.co` (Sydney region)

## Set up the database

1. Open the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole of `migrations/20261009000000_initial_schema.sql`.
3. Click **Run**. It should finish with "Success. No rows returned".
4. Open **Advisors → Security Advisor** and check there are no errors.

Run each migration file once, in date order. Later changes will come as new
files in `migrations/`; never edit a file that has already been run.

## Make someone an admin

Admins cannot be created from the website. After the person has signed up,
run this in the SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'their@email.com';
```

## What is in the database

| Area | Tables |
|---|---|
| Accounts | `profiles` |
| Family | `family_members` |
| Shelf | `children`, `books` (shelf and wishlist), `reading_sessions`, `activity`, `wishlist_shares` |
| Community | `board_posts`, `reviews`, `suggestions` |
| Chat | `chat_threads`, `chat_members`, `chat_messages` |
| Alerts | `notifications`, `push_subscriptions` |
| Support | `support_tickets`, `subscribers` |
| Admin | `audit_log` |

Storage buckets: `avatars`, `support-attachments` (both private).

Functions the website calls directly:

- `submit_contact_message(name, email, topic, message)`: public contact form, returns a `PTG-####` reference
- `subscribe(email, area)`: public newsletter sign-up
- `accept_family_invite(ref)`: invited carer accepts after signing in
- `get_shared_wishlist(token)`: public wishlist share link
- `write_audit(kind, what, detail)`: adds an entry to the admin audit log

## Security rules in short

- Parents see only their own shelf; accepted family carers can read it.
- Admins moderate posts and handle support, but cannot see families' children or shelves.
- New posts, reviews and suggestions are always `pending` until an admin approves them.
- Only admins can change a role or suspend an account; suspended accounts cannot post.
- Never put the secret (service_role) key in the website.
