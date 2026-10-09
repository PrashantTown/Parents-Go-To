-- Parents Go To: initial database schema
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run.
--
-- Security model
--   * Every table has Row Level Security (RLS) switched on.
--   * A parent sees and changes only their own shelf (children, books,
--     sessions). Accepted family members (carers) can read that shelf.
--   * Board posts, reviews and suggestions start as "pending" and only an
--     admin can approve them. Triggers enforce this, so the browser cannot.
--   * Admins moderate content and handle support tickets. They do not get
--     access to other families' children or shelves.
--   * Roles and account status can only be changed by an admin.

-- ---------------------------------------------------------------------------
-- Profiles (one row per signed-up user, created automatically)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '' check (char_length(display_name) <= 60),
  role text not null default 'parent' check (role in ('parent', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  colour text not null default '#0D3B32',
  avatar jsonb,
  preferences jsonb not null default '{}'::jsonb,
  bedtime jsonb not null default '{"start": "19:30", "winddown": 15, "autoSwitch": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Helper functions used by the security policies
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

-- True for requests coming straight from the website (anon or signed-in
-- users). False inside trusted functions marked "security definer", which
-- run as the database owner. The guard triggers below only police the
-- website, so trusted functions such as accept_family_invite() still work.
create function public.is_client_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Create a profile whenever someone signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step when a user changes their email.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Only an admin (or the server itself) may change role, status or email.
create function public.guard_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request() and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: read own, admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own, admins update all"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Family (carers invited to see a parent's shelf)
-- ---------------------------------------------------------------------------

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  ref text not null unique default ('PTG-F' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  name text not null check (char_length(name) between 1 and 60),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'carer' check (role in ('carer')),
  state text not null default 'invited' check (state in ('invited', 'accepted', 'withdrawn')),
  member_id uuid references public.profiles (id) on delete set null,
  invited_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (id) on delete set null
);

create unique index family_members_one_live_invite
  on public.family_members (owner_id, email)
  where state <> 'withdrawn';
create index family_members_member_idx on public.family_members (member_id);
create index family_members_email_idx on public.family_members (email);

-- True when the signed-in user may read this owner's shelf.
create function public.can_view_shelf(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select owner = auth.uid()
    or exists (
      select 1 from public.family_members f
      where f.owner_id = owner
        and f.member_id = auth.uid()
        and f.state = 'accepted'
    );
$$;

-- The owner cannot fake an acceptance; only accept_family_invite() does that.
create function public.guard_family_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_client_request() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.invited_by := auth.uid();
    new.state := 'invited';
    new.member_id := null;
    new.accepted_at := null;
    new.withdrawn_at := null;
    new.withdrawn_by := null;
    return new;
  end if;
  new.owner_id := old.owner_id;
  new.email := old.email;
  new.member_id := old.member_id;
  new.accepted_at := old.accepted_at;
  -- The only allowed change of state here is withdrawing.
  if new.state <> old.state and new.state <> 'withdrawn' then
    new.state := old.state;
  end if;
  if new.state = 'withdrawn' and old.state <> 'withdrawn' then
    new.withdrawn_at := now();
    new.withdrawn_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger family_members_guard
  before insert or update on public.family_members
  for each row execute function public.guard_family_member();

-- Called by the invited person after they sign in with the invited email.
create function public.accept_family_invite(invite_ref text)
returns public.family_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  me_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invite public.family_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept this invitation.';
  end if;
  update public.family_members
     set state = 'accepted', member_id = auth.uid(), accepted_at = now()
   where ref = upper(invite_ref)
     and email = me_email
     and state = 'invited'
  returning * into invite;
  if invite.id is null then
    raise exception 'This invitation was not found, was withdrawn, or was sent to a different email address.';
  end if;
  return invite;
end;
$$;

alter table public.family_members enable row level security;

create policy "family: owner and invitee can read"
  on public.family_members for select to authenticated
  using (
    owner_id = (select auth.uid())
    or member_id = (select auth.uid())
    or email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

create policy "family: owner invites"
  on public.family_members for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active()));

create policy "family: owner or member updates"
  on public.family_members for update to authenticated
  using (owner_id = (select auth.uid()) or member_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) or member_id = (select auth.uid()));

create policy "family: owner deletes"
  on public.family_members for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Shelf: children, books (shelf + wishlist), reading sessions, activity
-- ---------------------------------------------------------------------------

create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  age smallint check (age between 0 and 18),
  band text not null default '',
  colour text not null default '#0D3B32',
  likes text[] not null default '{}',
  looks jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_parent_idx on public.children (parent_id);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  list text not null default 'shelf' check (list in ('shelf', 'wishlist')),
  title text not null check (char_length(title) between 1 and 200),
  author text not null default '' check (char_length(author) <= 120),
  category text not null default '',
  ages text not null default '',
  status text not null default 'toread' check (status in ('toread', 'reading', 'read')),
  reader_ids uuid[] not null default '{}',
  spine text not null default '#0D3B32',
  cover text not null default '',
  pages integer check (pages between 0 and 5000),
  page integer check (page between 0 and 5000),
  started_at timestamptz,
  finished_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_owner_idx on public.books (owner_id, list);

create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  child_id uuid references public.children (id) on delete set null,
  read_on date not null default current_date,
  minutes smallint not null check (minutes between 1 and 600),
  page integer check (page between 0 and 5000),
  created_at timestamptz not null default now()
);

create index reading_sessions_owner_idx on public.reading_sessions (owner_id, read_on desc);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);

create index activity_owner_idx on public.activity (owner_id, created_at desc);

create trigger children_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

create trigger books_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

alter table public.children enable row level security;
alter table public.books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.activity enable row level security;

create policy "children: owner and family read"
  on public.children for select to authenticated
  using ((select public.can_view_shelf(parent_id)));
create policy "children: owner writes"
  on public.children for all to authenticated
  using (parent_id = (select auth.uid()))
  with check (parent_id = (select auth.uid()) and (select public.is_active()));

create policy "books: owner and family read"
  on public.books for select to authenticated
  using ((select public.can_view_shelf(owner_id)));
create policy "books: owner writes"
  on public.books for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (select public.is_active()));

create policy "sessions: owner and family read"
  on public.reading_sessions for select to authenticated
  using ((select public.can_view_shelf(owner_id)));
create policy "sessions: owner writes"
  on public.reading_sessions for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (select public.is_active())
    and exists (select 1 from public.books b where b.id = book_id and b.owner_id = (select auth.uid()))
    and (child_id is null or exists (select 1 from public.children c where c.id = child_id and c.parent_id = (select auth.uid())))
  );

create policy "activity: owner and family read"
  on public.activity for select to authenticated
  using ((select public.can_view_shelf(owner_id)));
create policy "activity: owner writes"
  on public.activity for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Wishlist sharing (public read-only links)
-- ---------------------------------------------------------------------------

create table public.wishlist_shares (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index wishlist_shares_owner_idx on public.wishlist_shares (owner_id);

alter table public.wishlist_shares enable row level security;

create policy "wishlist shares: owner manages"
  on public.wishlist_shares for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Anyone with a live link sees book details only: no child names, no email.
create function public.get_shared_wishlist(share_token text)
returns table (owner_name text, title text, author text, category text, ages text, notes text)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(p.display_name, ' ', 1), b.title, b.author, b.category, b.ages, b.notes
  from public.wishlist_shares s
  join public.profiles p on p.id = s.owner_id
  join public.books b on b.owner_id = s.owner_id and b.list = 'wishlist'
  where s.token = share_token
    and s.revoked_at is null
    and p.status = 'active'
  order by b.created_at;
$$;

grant execute on function public.get_shared_wishlist(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Community content: board posts, reviews, suggestions (moderated)
-- ---------------------------------------------------------------------------

create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text not null default 'A parent' check (char_length(author_name) <= 60),
  body text not null check (char_length(body) between 10 and 600),
  ages text not null default '',
  reply_to uuid references public.board_posts (id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'approved', 'published', 'rejected', 'removed')),
  reason text not null default '',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index board_posts_state_idx on public.board_posts (state, created_at desc);
create index board_posts_reply_idx on public.board_posts (reply_to);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text not null default 'A parent' check (char_length(author_name) <= 60),
  book_key text not null check (char_length(book_key) between 1 and 330),
  book_title text not null check (char_length(book_title) between 1 and 200),
  book_author text not null default '' check (char_length(book_author) <= 120),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 500),
  edited_at timestamptz,
  state text not null default 'pending' check (state in ('pending', 'approved', 'published', 'rejected', 'removed')),
  reason text not null default '',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, book_key)
);

create index reviews_book_idx on public.reviews (book_key, state);
create index reviews_state_idx on public.reviews (state, created_at desc);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text not null default 'A parent' check (char_length(author_name) <= 60),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1000),
  link text not null default '' check (char_length(link) <= 500),
  category text not null default '',
  ages text not null default '',
  state text not null default 'pending' check (state in ('pending', 'approved', 'published', 'rejected', 'removed')),
  reason text not null default '',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suggestions_state_idx on public.suggestions (state, created_at desc);

-- Shared by all three tables. Non-admins always post as themselves, always
-- start as pending, and go back to pending if they edit the text.
create function public.guard_moderated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_client_request() then
    return new;
  end if;
  if public.is_admin() then
    if tg_op = 'UPDATE' and new.state is distinct from old.state then
      new.decided_by := auth.uid();
      new.decided_at := now();
      perform public.write_audit('moderation', tg_table_name || ' ' || old.state || ' -> ' || new.state,
                                 jsonb_build_object('id', new.id, 'reason', new.reason));
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.state := 'pending';
    new.reason := '';
    new.decided_by := null;
    new.decided_at := null;
    return new;
  end if;
  new.author_id := old.author_id;
  new.decided_by := old.decided_by;
  new.decided_at := old.decided_at;
  new.reason := old.reason;
  if to_jsonb(new) - 'state' - 'updated_at' - 'edited_at' is distinct from to_jsonb(old) - 'state' - 'updated_at' - 'edited_at' then
    new.state := 'pending';
    if tg_table_name = 'reviews' then
      new.edited_at := now();
    end if;
  elsif new.state = 'removed' then
    null; -- authors may take down their own post
  else
    new.state := old.state;
  end if;
  return new;
end;
$$;

create trigger board_posts_guard before insert or update on public.board_posts
  for each row execute function public.guard_moderated();
create trigger reviews_guard before insert or update on public.reviews
  for each row execute function public.guard_moderated();
create trigger suggestions_guard before insert or update on public.suggestions
  for each row execute function public.guard_moderated();

create trigger board_posts_updated_at before update on public.board_posts
  for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();
create trigger suggestions_updated_at before update on public.suggestions
  for each row execute function public.set_updated_at();

alter table public.board_posts enable row level security;
alter table public.reviews enable row level security;
alter table public.suggestions enable row level security;

create policy "board: read approved, own, or as admin"
  on public.board_posts for select to authenticated
  using (state in ('approved', 'published') or author_id = (select auth.uid()) or (select public.is_admin()));
create policy "board: signed-in parents post"
  on public.board_posts for insert to authenticated
  with check ((select public.is_active()));
create policy "board: author or admin edits"
  on public.board_posts for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "board: author or admin deletes"
  on public.board_posts for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "reviews: read approved, own, or as admin"
  on public.reviews for select to authenticated
  using (state in ('approved', 'published') or author_id = (select auth.uid()) or (select public.is_admin()));
create policy "reviews: signed-in parents post"
  on public.reviews for insert to authenticated
  with check ((select public.is_active()));
create policy "reviews: author or admin edits"
  on public.reviews for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "reviews: author or admin deletes"
  on public.reviews for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "suggestions: read approved, own, or as admin"
  on public.suggestions for select to authenticated
  using (state in ('approved', 'published') or author_id = (select auth.uid()) or (select public.is_admin()));
create policy "suggestions: signed-in parents post"
  on public.suggestions for insert to authenticated
  with check ((select public.is_active()));
create policy "suggestions: author or admin edits"
  on public.suggestions for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "suggestions: author or admin deletes"
  on public.suggestions for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Chat (family, shelf and community threads)
-- ---------------------------------------------------------------------------

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('family', 'shelf', 'community')),
  key text not null default '',
  title text not null default '' check (char_length(title) <= 120),
  state text not null default 'open' check (state in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_owner_idx on public.chat_threads (owner_id);

create table public.chat_members (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index chat_members_user_idx on public.chat_members (user_id);

-- child_id is set when a child writes from their parent's signed-in device.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete set null,
  child_id uuid references public.children (id) on delete set null,
  sender_name text not null default '' check (char_length(sender_name) <= 60),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

create function public.is_thread_member(thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_members
    where thread_id = thread and user_id = auth.uid()
  );
$$;

create function public.is_thread_owner(thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads
    where id = thread and owner_id = auth.uid()
  );
$$;

-- The thread creator is always a member.
create function public.add_thread_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_members (thread_id, user_id)
  values (new.id, new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger chat_threads_add_owner
  after insert on public.chat_threads
  for each row execute function public.add_thread_owner();

create function public.touch_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

create trigger chat_messages_touch_thread
  after insert on public.chat_messages
  for each row execute function public.touch_thread();

alter table public.chat_threads enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

create policy "threads: members read"
  on public.chat_threads for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_thread_member(id)));
create policy "threads: create own"
  on public.chat_threads for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active()));
create policy "threads: owner updates"
  on public.chat_threads for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "threads: owner deletes"
  on public.chat_threads for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "members: members read"
  on public.chat_members for select to authenticated
  using ((select public.is_thread_member(thread_id)));
-- Owners can only add people who are in their family.
create policy "members: owner adds family"
  on public.chat_members for insert to authenticated
  with check (
    (select public.is_thread_owner(thread_id))
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.family_members f
        where f.owner_id = (select auth.uid()) and f.member_id = chat_members.user_id and f.state = 'accepted'
      )
    )
  );
create policy "members: mark own as read"
  on public.chat_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "members: owner removes, or leave"
  on public.chat_members for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_thread_owner(thread_id)));

create policy "messages: members read"
  on public.chat_messages for select to authenticated
  using ((select public.is_thread_member(thread_id)));
create policy "messages: members send as themselves"
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_active())
    and (select public.is_thread_member(thread_id))
    and (child_id is null or exists (
      select 1 from public.children c where c.id = child_id and c.parent_id = (select auth.uid())
    ))
  );
create policy "messages: sender deletes"
  on public.chat_messages for delete to authenticated
  using (sender_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Notifications and web push
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'system',
  tone text not null default 'info' check (tone in ('info', 'good', 'warn', 'alert')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 600),
  go text not null default '',
  tag text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
-- Users may only notify themselves; everything else comes from triggers.
create policy "notifications: create own"
  on public.notifications for insert to authenticated
  with check (recipient_id = (select auth.uid()));
create policy "notifications: mark own as read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create policy "notifications: delete own"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

create function public.notify_admins(n_kind text, n_title text, n_body text, n_go text, n_tag text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, title, body, go, tag)
  select id, n_kind, left(n_title, 160), left(n_body, 600), n_go, n_tag
  from public.profiles
  where role = 'admin' and status = 'active';
$$;

revoke execute on function public.notify_admins(text, text, text, text, text) from public, anon, authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push: manage own"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Support tickets (contact form + in-app reports) and newsletter sign-ups
-- ---------------------------------------------------------------------------

create sequence public.support_ticket_ref_seq start 1001;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('PTG-' || nextval('public.support_ticket_ref_seq')::text),
  user_id uuid references public.profiles (id) on delete set null,
  source text not null default 'app' check (source in ('public', 'app')),
  name text not null default '' check (char_length(name) <= 80),
  email text not null check (char_length(email) <= 254 and position('@' in email) > 1),
  area text not null default '' check (char_length(area) <= 80),
  severity text not null default 'med' check (severity in ('low', 'med', 'high')),
  severity_text text not null default '' check (char_length(severity_text) <= 200),
  body text not null check (char_length(body) between 1 and 4000),
  diag text not null default '' check (char_length(diag) <= 4000),
  attachment_paths text[] not null default '{}',
  state text not null default 'open' check (state in ('open', 'progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_state_idx on public.support_tickets (state, created_at desc);

create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

create function public.guard_support_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request() and not public.is_admin() then
    new.user_id := auth.uid();
    new.source := 'app';
    new.state := 'open';
  end if;
  return new;
end;
$$;

create trigger support_tickets_guard before insert on public.support_tickets
  for each row execute function public.guard_support_ticket();

create function public.announce_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_admins(
    'support',
    'New message — ' || new.ref,
    'From ' || coalesce(nullif(new.name, ''), new.email) || ' about ' || coalesce(nullif(new.area, ''), 'something else') || '.',
    'settings',
    'report-' || new.id::text
  );
  return new;
end;
$$;

create trigger support_tickets_announce after insert on public.support_tickets
  for each row execute function public.announce_support_ticket();

alter table public.support_tickets enable row level security;

create policy "tickets: own or admin read"
  on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "tickets: signed-in users report"
  on public.support_tickets for insert to authenticated
  with check (true);
create policy "tickets: admins update"
  on public.support_tickets for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Public contact form (works without signing in). Returns the reference.
create function public.submit_contact_message(
  sender_name text,
  sender_email text,
  topic text,
  message text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(sender_email, '')));
  recent integer;
  new_ref text;
begin
  if char_length(trim(coalesce(sender_name, ''))) = 0 then
    raise exception 'Tell us what to call you.';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right.';
  end if;
  if char_length(trim(coalesce(message, ''))) = 0 then
    raise exception 'Tell us what you need.';
  end if;
  select count(*) into recent
  from public.support_tickets
  where email = clean_email and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'You have sent several messages in the last hour. Please wait a little before sending another.';
  end if;
  insert into public.support_tickets (user_id, source, name, email, area, severity_text, body)
  values (
    auth.uid(),
    'public',
    left(trim(sender_name), 80),
    clean_email,
    left(coalesce(topic, ''), 80),
    'Sent from the contact form',
    left(trim(message), 4000)
  )
  returning ref into new_ref;
  return new_ref;
end;
$$;

grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  area text not null default '',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);

alter table public.subscribers enable row level security;

create policy "subscribers: admins read"
  on public.subscribers for select to authenticated
  using ((select public.is_admin()));

-- Public sign-up box. Never reveals whether an address was already listed.
create function public.subscribe(sub_email text, sub_area text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(sub_email, '')));
begin
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address does not look right.';
  end if;
  insert into public.subscribers (email, area)
  values (clean_email, left(coalesce(sub_area, ''), 80))
  on conflict (email) do update set unsubscribed_at = null;
end;
$$;

grant execute on function public.subscribe(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log (admins only)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'account',
  what text not null check (char_length(what) <= 300),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy "audit: admins read"
  on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- The actor is always the signed-in user, so entries cannot be forged.
create function public.write_audit(a_kind text, a_what text, a_detail jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, kind, what, detail)
  values (auth.uid(), left(coalesce(a_kind, 'account'), 40), left(coalesce(a_what, ''), 300), a_detail);
$$;

revoke execute on function public.write_audit(text, text, jsonb) from public, anon;
grant execute on function public.write_audit(text, text, jsonb) to authenticated;

create function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.audit_log (actor_id, kind, what, detail)
    values (
      auth.uid(),
      'account',
      'Account ' || new.email || ': role ' || new.role || ', status ' || new.status,
      jsonb_build_object('user', new.id, 'old_role', old.role, 'old_status', old.status)
    );
  end if;
  return new;
end;
$$;

create trigger profiles_audit after update on public.profiles
  for each row execute function public.audit_profile_change();

-- ---------------------------------------------------------------------------
-- Admin alerts for new content waiting for moderation
-- ---------------------------------------------------------------------------

create function public.announce_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'pending' then
    perform public.notify_admins(
      'moderation',
      case tg_table_name
        when 'board_posts' then 'New board post to check'
        when 'reviews' then 'New review to check'
        else 'New suggestion to check'
      end,
      'From ' || new.author_name || '.',
      'settings',
      tg_table_name || '-' || new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger board_posts_announce after insert on public.board_posts
  for each row execute function public.announce_pending();
create trigger reviews_announce after insert on public.reviews
  for each row execute function public.announce_pending();
create trigger suggestions_announce after insert on public.suggestions
  for each row execute function public.announce_pending();

-- ---------------------------------------------------------------------------
-- Realtime (live chat and notifications)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.chat_messages, public.notifications;

-- ---------------------------------------------------------------------------
-- Storage: avatars and support screenshots (private; files live in a folder
-- named after the user's id, e.g. "<user-id>/photo.png")
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('support-attachments', 'support-attachments', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: owner manages"
  on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "support files: owner uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "support files: owner or admin reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );
