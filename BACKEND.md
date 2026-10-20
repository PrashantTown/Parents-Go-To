# How this site talks to the backend

The site keeps its accounts and data on the Parents Go To API (Node/Express and MongoDB, in the [`PrashantTown/books`](https://github.com/PrashantTown/books) repository) instead of only in the browser. This note covers the frontend side. The backend's `docs/API.md` lists every endpoint.

The pages were written to call `window.PTGBackend` for anything that needs a server, and to keep their data through `window.PTGStore` (`store.js`). Four files provide those against the API, so the pages themselves needed only small changes.

## Setting it up

1. **Running locally.** Start the backend (`npm run dev` in the backend folder, on port 5000) and serve this folder with any static server:

   ```bash
   npx serve -l 5500 .        # or: python3 -m http.server 5500
   ```

   Open <http://localhost:5500/reading-for-pleasure.html>. On `localhost`, `config.js` points at `http://localhost:5000` automatically.

2. **Live site.** `config.js` already points at the deployed API, `https://parents-go-to-api.onrender.com`. The backend lists the sites allowed to call it in `CORS_ORIGINS` (in its `render.yaml`), and each page's `Content-Security-Policy` lists the API under `connect-src`. If the API moves, update all three.

**Demo accounts** (after `npm run seed` on the backend, with no `SEED_*` passwords set):

| Account | Email | Password |
|---|---|---|
| Parent | `demo@parentsgoto.test` | `demo1234` |
| Administrator | `admin@parentsgoto.test` | `demo1234-admin` |

Administrators also enter a six-digit code. With email set up on the backend, a fresh code is emailed to the administrator's own address at every sign-in, so the demo administrator (a `.test` address) can't sign in then; use a real administrator account. Without email, it's the shared `ADMIN_LOGIN_CODE`, if one is set.

## The four files

They load in this order, straight after `store.js`, on `reading-for-pleasure.html`, `index.html`, `contact.html` and `project.html`:

| File | What it does |
|---|---|
| `config.js` | Sets `window.PTG_CONFIG`: `apiBase` (the API address) and `pollSeconds` (how often shared things refresh; 20 by default) |
| `api.js` | `window.PTGApi`: wraps `fetch` with the sign-in token, a 15-second timeout and readable errors |
| `sync.js` | `window.PTGSync`: keeps the stores listed below in step with the API |
| `backend.js` | `window.PTGBackend`: sign-in and accounts, the family shelf, the admin console's lists, carers' shared shelves, the contact form |

### `PTGBackend`

The methods the pages call, and what each does on the server:

| Method | API |
|---|---|
| `signIn(email, password, role, remember)` | `POST /api/auth/login`. Resolves `{ needsCode: true }` for administrators |
| `adminFactor()`, `verifyAdminCode(id, code)` | `POST /api/auth/admin-code`: the six-digit code emailed to that administrator for this sign-in (or, if the server has no email set up, the shared administrator code). There is no authenticator app |
| `signUp(name, email, password)` | `POST /api/auth/register`. With email set up, resolves `{ confirm: true }` and the page shows "Confirm your email" |
| `resendConfirmation(email)` | `POST /api/auth/resend-confirmation` |
| `resetPassword(email)` | `POST /api/auth/forgot-password`: emails a reset link (or, without email, tells the administrators) |
| `setNewPassword(pw)`, `continueAfterRecovery()` | From an emailed reset link: `POST /api/auth/reset-password`. After signing in with a temporary password: `PUT /api/auth/password`. Then into the app |
| `verifyPassword(pw)`, `changePassword(pw)` | `POST /api/auth/verify-password`, then `PUT /api/auth/password` |
| `changeEmail(email)`, `rename(name)` | `PATCH /api/auth/me`. The email changes at once and fires `ptg:email-changed` |
| `signOut()`, `signOutOthers()` | `POST /api/auth/logout`, `POST /api/auth/logout-others` |
| `deleteAccount(password)` | `DELETE /api/auth/me` |
| `accounts()`, `setAccountStatus()`, `adminDeleteAccount()` | `/api/admin/users…` |
| `addAdmin(email, name)` | `POST /api/admin/admins`: adds an administrator and emails them a link to choose their password (needs email on the server) |
| `sendReset(email)` | `POST /api/admin/users/:id/temp-password`: a temporary password for the administrator to pass on. The console offers it only while the server has no email set up |
| `audit()`, `auditList()` | `/api/audit` |
| `sharedShelves()`, `acceptInvite(ref)` | `/api/family/shared`, `/api/family/:id/accept` |
| `sharedWishlist(token)` | `GET /api/share/:token` |
| `contact(…)`, `subscribe(email)` | `POST /api/support`: the console's inbox, and emailed to the team when email is on |
| `downloadShot("api:<id>")` | `GET /api/support/:id/screenshot` |

`PTGBackend.emailOn` is true when the backend has email set up (from `GET /api/health`); it also sets `PTG_CONFIG.inviteEmails`, so the carer screen says the invitation was emailed.

Google sign-in, push notifications to phones and the Settings page's emailed password code aren't offered (a forgotten password is reset from an emailed link instead), so `signInWithGoogle`, `enablePush` and `sendPasswordCode` don't exist and the pages hide those options.

**Links in emails** open `reading-for-pleasure.html#reset=<token>` (choose a new password) or `#confirm=<token>` (a new account confirming its email). `backend.js` takes the token out of the address bar before anything else runs, then shows "Choose a new password", or confirms the account and opens the shelf.

**Opening a page.** If a sign-in token is saved, `backend.js` checks it with `GET /api/auth/me`, opens the session quietly and loads everything, then fires `ptg:auth` (while it works, `PTGBackend.restoring` is true and the page waits). After every load it fires `ptg:data`.

**The family shelf** lives in memory in the page (`PTGApp`). Every 1.5 seconds `backend.js` compares `PTGApp.capture()` with what the server last confirmed and sends the differences in one `PATCH /api/shelf`. It also saves when the tab is hidden or closed. Changes made on another device arrive on the next refresh (every 20 seconds and when the tab comes back into focus), unless an edit dialog is open or something here is still being saved.

**When the session ends on the server** (password changed elsewhere, account suspended, "sign out everywhere"), the next request answers 401 and the page signs out with a message.

### `PTGSync`

The pages read and write their stores through `PTGStore`, which uses `localStorage`. `sync.js` sits underneath:

- **Sending changes.** When a page writes one of the keys below, `sync.js` compares the new value with the old one record by record, puts the changes in an outbox (`ptg-sync-outbox-v1`, which survives a reload), and sends them about 0.4 s later.
- **Refreshing.** After sign-in, every 20 seconds and when the tab comes back into focus, it fetches each key and writes it back. Changes still waiting in the outbox are laid on top, so nothing typed offline is lost. Then it fires the module's usual event (for example `ptg:board`), plus `ptg:store` and `ptg:synced` with `{ key }`, so the page redraws.
- **Before sign-in**, the public keys (projects and the book catalogue) are loaded without a token, so the home page shows the live project tiles.
- **The server is the source of truth.** It decides moderation, permissions and anything it assigns. A change it refuses is dropped, the next refresh puts the server's version back, and a short message says why.
- **Signing out** sends anything waiting (still as that person), then removes the synced keys from this browser.

## What is kept on the server

| Store | API | Who |
|---|---|---|
| The family shelf (in memory) | `/api/shelf` | parents |
| `ptg-settings-v1` | `/api/me/data/prefs`, `/api/settings/platform` | parents, admins |
| `ptg-projects-v1` | `/api/projects` | everyone reads, admins write |
| `ptg-catalogue-v1` | `/api/catalogue` | everyone reads, admins write |
| `ptg-resources-v1` | `/api/resources` | signed-in people read, admins write |
| `ptg-suggestions-v1` | `/api/community/suggestions` | parents send, admins moderate |
| `ptg-board-v1` | `/api/community/board` | parents post, admins moderate |
| `ptg-reviews-v1` | `/api/community/reviews` | parents write, admins moderate |
| `ptg-family-v1` | `/api/family` (carer invitations) | parents |
| `ptg-chat-v1` | `/api/chat` | parents |
| `ptg-notes-v1` | `/api/notifications` | parents, admins |
| `ptg-support-v1` | `/api/support` | everyone (visitors can send) |
| `ptg-wishlist-share-v1` | `/api/share/mine` | parents |
| `ptg-genres-v1`, `ptg-welcome-v1`, `ptg-kid-looks` | `/api/me/data/genres`, `welcome`, `kidLooks` | parents |

Some things stay in this browser on purpose, because they belong to the device rather than the person: display choices (`ptg-theme`, `ptg-reduce`, `ptg-bigtext`, `ptg-compact`, `ptg-lib-view`), which notifications were seen here (`ptg-notes-seen-v1`, `ptg-notes-remind-v1`), known devices (`ptg-known-devices-v1`), "keep me signed in" (`ptg-remember`) and the token (`ptg-token-v1`). Screenshots attached to problem reports are uploaded to the server and also kept in this browser's IndexedDB.

## Changing the code

**Editing data the site already syncs.** Write through `PTGStore` as the modules do, and it will be sent. Give new records a unique `id` (`PTGStore.uuid()`): the server keeps your ids.

**Syncing a new key.** Add an endpoint on the backend, then register an adapter near the others in `sync.js`. For a key shaped `{ items: [{ id, … }] }`, `listAdapter` does most of the work:

```js
register(listAdapter({
  key: "ptg-example-v1",
  roles: ["parent", "admin"],     // who syncs it (pushRoles / pullRoles narrow it further)
  path: "/api/example",           // GET must answer { items: [...] }
  event: "ptg:example",           // fired after a refresh so the page redraws
  poll: true,                     // refresh on the timer, not just at sign-in
  change: function (before, after, ctx, api) {
    if (!before && after) return api.post("/api/example", after);           // added
    if (before && !after) return api.del("/api/example/" + enc(before.id));  // removed
    return api.put("/api/example/" + enc(after.id), after);                 // edited
  }
}));
```

## Changes to the existing files

| File | Change |
|---|---|
| `reading-for-pleasure.html`, `index.html`, `contact.html`, `project.html` | Load the four files after `store.js` |
| Every page | `connect-src` in the Content-Security-Policy allows the API (and `localhost:5000` for local development). The contact email is now the client's, tsander2@usc.edu.au |
| `reading-for-pleasure.html` | The administrator-code and "choose a new password" screens describe how this backend works. The Google sign-in buttons are hidden. The console's Accounts page has an **Add an administrator** button and dialog, and the page loads `admins.js` |
| `admins.js` (new) | The **Add an administrator** dialog: checks the email, calls `PTGBackend.addAdmin`, and refreshes the accounts list |
| `script.js` | The console's "Temporary password" button only appears while the server has no email set up; with email, people reset their own password from an emailed link. Wishlist cards say who added each book ("Added by Harry · 20 Oct"); books a child adds from their reading space record their name. A category with no books on the family's shelf yet says how many there are to discover, and opens **Library > Discover books** on that category. Small wording changes to match |
| `settings.js` | Deleting an account asks for the password. Changing the sign-in email takes effect at once. The emailed-code reset option is hidden |
| `page-loading.js` | Shows the loading state when a saved sign-in is being restored |
