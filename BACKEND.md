# How this site talks to the backend

The site now keeps its accounts and data on the Parents Go To API (Node/Express and MongoDB, in the `books` backend repository) instead of only in the browser. This note covers the frontend side. The backend's `docs/API.md` lists every endpoint, and its `docs/HANDOVER.md` explains the decisions behind them.

## Setting it up

1. **Running locally.** Start the backend (`npm run dev` in the backend folder, on port 5000) and serve this folder with any static server:

   ```bash
   npx serve -l 5500 .        # or: python3 -m http.server 5500
   ```

   Open <http://localhost:5500/reading-for-pleasure.html>. On `localhost`, `config.js` points at `http://localhost:5000` automatically.

2. **Live site.** In `config.js`, set `DEPLOYED_API` to the deployed API's address (no trailing slash). On the backend, add this site's address to `CORS_ORIGINS`, for example `https://parents-go-to.vercel.app`.

Until `DEPLOYED_API` is set, sign-in, sign-up and "forgot password" show "This copy of the site isn't connected to its server yet" rather than failing silently. So deploy the API first, then this site.

**Demo accounts** (after `npm run seed` on the backend):

| Account | Email | Password |
|---|---|---|
| Parent | `demo@parentsgoto.test` | `demo1234` |
| Administrator | `admin@parentsgoto.test` | `demo1234-admin` |

The administrator also enters the `ADMIN_LOGIN_CODE` from the backend's settings, if that code is set.

## The three new files

They load in this order, before the rest of the scripts:

| File | What it does | Loaded by |
|---|---|---|
| `config.js` | Sets `window.PTG_CONFIG`: `apiBase` (the API address) and `pollSeconds` (how often shared things refresh; 20 by default) | `reading-for-pleasure.html`, `index.html`, `contact.html` |
| `api.js` | `window.PTGApi`: wraps `fetch` with the sign-in token, a 15-second timeout and readable errors | the same three pages |
| `sync.js` | `window.PTGSync`: keeps the localStorage keys listed below in step with the API | `reading-for-pleasure.html` |

### `PTGApi`

```js
PTGApi.get("/api/shelf").then(function (d) { /* d.shelf */ });
PTGApi.post(path, body);  PTGApi.put(path, body);  PTGApi.patch(path, body);  PTGApi.del(path);
PTGApi.auth.login(email, password, "parent" | "admin");   // and register, forgot, me, logout, updateMe, changePassword, deleteMe, adminCode
PTGApi.admin.users();                                    // and setStatus, tempPassword, remove
PTGApi.errorMessage(err, "Fallback text");               // readable message for any error
```

- **Errors:** a failed call rejects with a `PTGApi.Error` that has `status` (0 means the server couldn't be reached), `code` and `message`.
- **The sign-in token:** kept under `ptg-token-v1`. It is stored in `sessionStorage`, or in `localStorage` when "Keep me signed in" is ticked.
- **Events** fired on `window`:
  - `ptg:unauthorized` when the server ends the session (password changed elsewhere, account suspended, token expired). The session code signs the person out.
  - `ptg:online` with `{ online: true | false }`.

### `PTGSync`: why most of the code didn't change

The modules (shelf, board, reviews, chat, console and so on) still read and write `localStorage` exactly as before. `sync.js` sits underneath:

- **Sending changes.** When a module writes one of the keys below, `sync.js` compares the new value with the old one record by record, puts the changes in an outbox (`ptg-sync-outbox-v1`, which survives a reload), and sends them to the API about 0.4 s later.
- **Refreshing.** After sign-in, every 20 seconds, and when the tab comes back into focus, it fetches each key from the API and writes it to `localStorage`. Changes still waiting in the outbox are laid back on top, so nothing typed offline is lost. It then fires the module's usual change event (for example `ptg:board`), plus `ptg:synced` with `{ key }`, so the page redraws.
- **The server is the source of truth.** It decides moderation, permissions and anything it assigns. A change it refuses is dropped, the next refresh puts the server's version back, and a short message tells the person why.
- **No refresh mid-edit.** A refresh never replaces the shelf while one of its edit dialogs is open; it waits until the dialog closes.
- **Signing out.** Waiting changes are sent first, still as that person. Then the synced keys are removed from this browser, so the next person on the same computer sees nothing of theirs.

Other methods, for special cases: `PTGSync.pull(key)`, `pullAll()`, `flush(key)`, `flushAll()`, `pending(key)`, `pause()`/`resume()` (around code that rewrites lots of data that shouldn't be sent), `rekey(email)` (after an email change), and `toast(message)`.

## What is kept on the server

| localStorage key | API | Who |
|---|---|---|
| `ptg-accounts-v1` | `/api/admin/users`, or `/api/auth/me` for parents (read only) | parents (self), admins (everyone) |
| `ptg-settings-v1` | `/api/me/data/prefs`, `/api/settings/platform` | parents, admins |
| `ptg-shelves-v1` | `/api/shelf` (a batch of changes per save) | parents |
| `ptg-console-v1` | `/api/resources`, suggestion moderation | admins send changes, parents read |
| `ptg-suggestions-v1` | `/api/community/suggestions` | parents send, admins read |
| `ptg-board-v1` | `/api/community/board` | parents post, admins moderate |
| `ptg-reviews-v1` | `/api/community/reviews` | parents write, admins moderate |
| `ptg-family-v1` | `/api/family` (carer invitations) | parents |
| `ptg-chat-v1` | `/api/chat` | parents |
| `ptg-notes-v1` | `/api/notifications` | parents, admins |
| `ptg-support-v1` | `/api/support` | everyone (visitors can send) |
| `ptg-audit-v1` | `/api/audit` | parents and admins write, admins read |
| `ptg-wishlist-share-v1` | `/api/share/mine` | parents |
| `ptg-genres-v1`, `ptg-welcome-v1`, `ptg-kid-looks` | `/api/me/data/genres`, `welcome`, `kidLooks` | parents |

Some things stay in this browser on purpose, because they belong to the device rather than the person:

- display choices: `ptg-theme`, `ptg-reduce`, `ptg-bigtext`, `ptg-compact`, `ptg-lib-view`;
- which notifications were seen here: `ptg-notes-seen-v1`, `ptg-notes-remind-v1`;
- known devices: `ptg-known-devices-v1`;
- the session: `ptg-session-v1`, `ptg-token-v1`.

Screenshots attached to problem reports are uploaded to the server and also cached in this browser's IndexedDB.

## Changing the code

**Editing data the site already syncs.** Write `localStorage` as the modules always have, and it will be sent. Give new records a unique `id`: the server keeps your ids, so you don't need to swap in server ids afterwards.

**One-off actions that aren't stored data.** For things like changing a password or uploading a screenshot, call `PTGApi` directly, as `settings.js` does.

**Syncing a new key.** Add an endpoint on the backend, then register an adapter near the others in `sync.js`. For a key shaped `{ items: [{ id, … }] }`, the `listAdapter` helper does most of the work:

```js
register(listAdapter({
  key: "ptg-example-v1",
  roles: ["parent", "admin"],     // who syncs it (pushRoles / pullRoles narrow it further)
  path: "/api/example",           // GET must answer { items: [...] }
  event: "ptg:example",           // fired after a refresh so the page redraws
  poll: true,                     // refresh on the timer, not just at sign-in
  seedBlocker: true,              // stop the module writing sample data before the server answers
  change: function (before, after, ctx, api) {
    if (!before && after) return api.post("/api/example", after);         // added
    if (before && !after) return api.del("/api/example/" + enc(before.id));  // removed
    return api.put("/api/example/" + enc(after.id), after);              // edited
  }
}));
```

For a small per-person document, use `perEmailDoc("ptg-example-v1", "example", ["parent"])`, and add `example` (with a size limit) to `KEYS` in the backend's `userDataController.js`.

## Changes to the existing files

| File | Change |
|---|---|
| `reading-for-pleasure.html`, `index.html`, `contact.html` | Load `config.js` and `api.js`, plus `sync.js` on the app page |
| `script.js` | Sign-in, sign-up, the administrator code and "forgot password" go through the API. Accounts in the console come from the server. The session checks its token on load and signs out properly. Console sample data is switched off when connected. Shared wishlist links open from the server. Also fixes the sign-in form snapping back after a quick sign-in |
| `settings.js` | Name, email, password and account deletion go through the API. Problem-report screenshots are uploaded. Support references are unique |
| `family.js` | A banner to accept or decline carer invitations, and an "Accepted" label |
| `avatar.js` | Redraws avatars after a refresh or a change of account |
| `contact-form.js`, `signup.js` | Send to `/api/support`, so messages reach the console's inbox. They fall back to opening an email, as before, when the server isn't set up or can't be reached |

Board posts and reviews that pass moderation automatically are now stored by the server as `published`, and they appear as soon as the server answers. Before, they were marked `approved`, which the pages never show. `board.js` and `reviews.js` still mark them `approved` for the moment before the server answers; changing those checks to `published` would tidy that up.

## Applying the patch

The change is a single commit on top of `ae1a018` ("Persist app data and update account flows"), the latest commit on `main` in `Sudarshan-2063/Parents-Go-To`.

```bash
git checkout main
git pull
git am -3 /path/to/frontend-connect-backend.patch
```

If you've committed more changes since `ae1a018`, `-3` merges them. Git stops and names any files where both sides changed the same lines. Fix those, then run `git add <file>` and `git am --continue`.

**Without git:** copy the files from the zip over your folder. The zip has no `.git` folder, so your history is untouched. Check `git status` and commit.
