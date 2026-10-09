-- Parents Go To: everything the website needs to run on the database.
-- Run once, after the two earlier migrations.

-- ---------------------------------------------------------------------------
-- Admins must use two-factor (authenticator app) for admin powers.
-- A password-only session counts as a normal parent.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'active'
    );
$$;

-- ---------------------------------------------------------------------------
-- Extra columns the website stores
-- ---------------------------------------------------------------------------

alter table public.profiles add column last_seen_at timestamptz;

-- Fields the website keeps on a child, book or reading session that have no
-- column of their own (reading level, avatar choices, ratings and so on).
alter table public.children add column extra jsonb not null default '{}'::jsonb;
alter table public.books add column extra jsonb not null default '{}'::jsonb;
alter table public.reading_sessions add column extra jsonb not null default '{}'::jsonb;

-- The website has no length limit on these, so allow more room.
alter table public.children drop constraint children_name_check;
alter table public.children add constraint children_name_check check (char_length(name) between 1 and 100);
alter table public.books drop constraint books_title_check;
alter table public.books add constraint books_title_check check (char_length(title) between 1 and 500);
alter table public.books drop constraint books_author_check;
alter table public.books add constraint books_author_check check (char_length(author) <= 300);
alter table public.books drop constraint books_notes_check;
alter table public.books add constraint books_notes_check check (char_length(notes) <= 10000);
-- A reading session can be logged with zero minutes (page only).
alter table public.reading_sessions drop constraint reading_sessions_minutes_check;
alter table public.reading_sessions add constraint reading_sessions_minutes_check check (minutes between 0 and 1440);

alter table public.family_members add column by_name text not null default '' check (char_length(by_name) <= 60);

alter table public.chat_threads add column meta jsonb not null default '{}'::jsonb;
alter table public.chat_members add column reads jsonb not null default '{}'::jsonb;
alter table public.chat_messages add column sender_key text not null default '';

alter table public.notifications add column audience text not null default 'parent' check (audience in ('parent', 'admin'));

alter table public.support_tickets add column from_email text not null default '' check (char_length(from_email) <= 254);
alter table public.support_tickets drop constraint support_tickets_source_check;
alter table public.support_tickets add constraint support_tickets_source_check check (source in ('public', 'parent', 'admin', 'app'));

-- ---------------------------------------------------------------------------
-- Site-wide settings chosen by admins (moderation rules and so on).
-- Only these keys are kept, so an admin's personal details never leak.
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.platform_settings (id) values (1);

create function public.clean_platform_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.settings := (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(new.settings)
    where key in ('holdAll', 'flagNames', 'linkAllow', 'lockAttempts', 'dormantAfter',
                  'subRetention', 'logRetention', 'savedAt')
  );
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger platform_settings_clean
  before insert or update on public.platform_settings
  for each row execute function public.clean_platform_settings();

alter table public.platform_settings enable row level security;

create policy "platform settings: signed-in users read"
  on public.platform_settings for select to authenticated
  using (true);
create policy "platform settings: admins change"
  on public.platform_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Automatic approval, the same rules the website used to run in the browser:
-- hold everything (on by default), hold posts that seem to name a person,
-- and hold links to sites outside the trusted list.
-- ---------------------------------------------------------------------------

create function public.auto_state(content text, link text, live_state text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
  links text[];
  l text;
  host text;
begin
  select settings into s from public.platform_settings where id = 1;
  s := coalesce(s, '{}'::jsonb);
  if coalesce((s ->> 'holdAll')::boolean, true) then
    return 'pending';
  end if;
  if coalesce((s ->> 'flagNames')::boolean, true)
     and regexp_replace(coalesce(content, ''), '(^|[.!?]\s+)[A-Z]', '\1x', 'g')
         ~ '\m[A-Z][a-z]{1,}\s+[A-Z][a-z]{2,}\M' then
    return 'pending';
  end if;
  select coalesce(array_agg(m[1]), '{}') into links
  from regexp_matches(coalesce(content, ''), '(https?://[^\s<>"'']+)', 'gi') as m;
  if coalesce(link, '') <> '' then
    links := links || link;
  end if;
  if coalesce((s ->> 'linkAllow')::boolean, true) then
    foreach l in array links loop
      host := substring(l from '^[a-zA-Z]+://([^/:?#]+)');
      if host is null or host !~* '((^|\.)(edu|gov|edu\.au|gov\.au|ac\.uk|gov\.uk|sch\.uk|org\.au)$|librar(y|ies)|penguin|harpercollins|scholastic|bloomsbury|walker|allenandunwin|hachette|macmillan|simonandschuster|randomhouse|usborne|oup\.com|abc\.net\.au|readingrockets\.org|booktrust\.org\.uk)' then
        return 'pending';
      end if;
    end loop;
  end if;
  return live_state;
end;
$$;

revoke execute on function public.auto_state(text, text, text) from public, anon;

-- Board posts and reviews go live as "published"; suggestions as "approved".
create or replace function public.guard_moderated()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  content text;
  link text := '';
  live text := 'published';
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
  if tg_table_name = 'suggestions' then
    content := new.title || ' ' || new.body;
    link := new.link;
    live := 'approved';
  else
    content := new.body;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.state := public.auto_state(content, link, live);
    new.reason := '';
    new.decided_by := null;
    new.decided_at := case when new.state = live then now() end;
    return new;
  end if;
  new.author_id := old.author_id;
  new.decided_by := old.decided_by;
  new.decided_at := old.decided_at;
  new.reason := old.reason;
  if to_jsonb(new) - 'state' - 'updated_at' - 'edited_at' is distinct from to_jsonb(old) - 'state' - 'updated_at' - 'edited_at' then
    new.state := public.auto_state(content, link, live);
    new.decided_by := null;
    new.decided_at := case when new.state = live then now() end;
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

-- Tell the author when an admin decides on their post.
create function public.announce_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  what text;
  t text;
  b text;
  go text := '';
  tone text := 'info';
begin
  if new.state is not distinct from old.state or new.author_id is null or new.decided_by is null
     or new.decided_by = new.author_id or new.state = 'pending' then
    return new;
  end if;
  what := case tg_table_name when 'board_posts' then 'post' when 'reviews' then 'review' else 'suggestion' end;
  if new.state in ('published', 'approved') then
    tone := 'good';
    if tg_table_name = 'suggestions' then
      t := 'Your suggestion was published';
      b := '“' || new.title || '” is now on the Resources tab for everyone.';
      go := 'resources';
    else
      t := 'Your ' || what || ' is live';
      b := 'Other parents can see it now.';
    end if;
  else
    tone := 'warn';
    t := 'Your ' || what || ' was not published';
    b := case when new.reason <> '' then new.reason || ' ' else '' end
         || 'You can see the full reply in the app.';
    go := 'settings';
  end if;
  insert into public.notifications (recipient_id, audience, kind, tone, title, body, go, tag)
  values (new.author_id, 'parent', 'moderation', tone, left(t, 160), left(b, 600), go,
          tg_table_name || '-' || new.id::text);
  return new;
end;
$$;

revoke execute on function public.announce_decision() from public, anon, authenticated;

create trigger board_posts_decision after update on public.board_posts
  for each row execute function public.announce_decision();
create trigger reviews_decision after update on public.reviews
  for each row execute function public.announce_decision();
create trigger suggestions_decision after update on public.suggestions
  for each row execute function public.announce_decision();

-- Admin alerts go to the admin side of the app.
create or replace function public.notify_admins(n_kind text, n_title text, n_body text, n_go text, n_tag text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, audience, kind, tone, title, body, go, tag)
  select id, 'admin', n_kind, 'info', left(n_title, 160), left(n_body, 600), n_go, n_tag
  from public.profiles
  where role = 'admin' and status = 'active';
$$;

revoke execute on function public.notify_admins(text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Resources written by admins ("From the team")
-- ---------------------------------------------------------------------------

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 4000),
  category text not null default '',
  ages text not null default '',
  link text not null default '' check (char_length(link) <= 500),
  state text not null default 'draft' check (state in ('draft', 'published')),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  by_name text not null default '' check (char_length(by_name) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger resources_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

alter table public.resources enable row level security;

create policy "resources: read published, admins read all"
  on public.resources for select to authenticated
  using (state = 'published' or (select public.is_admin()));
create policy "resources: admins write"
  on public.resources for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Family invites: tell the invited person in the app if they have an account
-- ---------------------------------------------------------------------------

create function public.announce_family_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, audience, kind, tone, title, body, go, tag)
  select p.id, 'parent', 'family', 'info',
         left(coalesce(nullif(new.by_name, ''), 'A parent') || ' invited you to their family shelf', 160),
         'Open the app to accept. Your invitation code is ' || new.ref || '.',
         'settings', 'invite-' || new.id::text
  from public.profiles p
  where lower(p.email) = new.email and p.id <> new.owner_id;
  return new;
end;
$$;

revoke execute on function public.announce_family_invite() from public, anon, authenticated;

create trigger family_members_announce after insert on public.family_members
  for each row execute function public.announce_family_invite();

-- ---------------------------------------------------------------------------
-- Chat: who wrote a message is set by the database, never by the browser
-- ---------------------------------------------------------------------------

create function public.guard_chat_message()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if public.is_client_request() then
    new.sender_key := case
      when new.child_id is null then 'mail:' || me
      else 'kid:' || me || ':' || new.child_id::text
    end;
  end if;
  return new;
end;
$$;

create trigger chat_messages_guard before insert on public.chat_messages
  for each row execute function public.guard_chat_message();

-- ---------------------------------------------------------------------------
-- Support tickets filed inside the app keep the side they came from
-- ---------------------------------------------------------------------------

create or replace function public.guard_support_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_client_request() and not public.is_admin() then
    new.user_id := auth.uid();
    new.state := 'open';
    new.from_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    if new.source not in ('parent', 'admin') then
      new.source := 'parent';
    end if;
  end if;
  return new;
end;
$$;

-- The contact form inside the app sends its own id so the message can be
-- matched up later; the public pages leave it empty.
drop function public.submit_contact_message(text, text, text, text);

create function public.submit_contact_message(
  sender_name text,
  sender_email text,
  topic text,
  message text,
  ticket_id uuid default null
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
  insert into public.support_tickets (id, user_id, source, name, email, from_email, area, severity_text, body)
  values (
    coalesce(ticket_id, gen_random_uuid()),
    auth.uid(),
    'public',
    left(trim(sender_name), 80),
    clean_email,
    clean_email,
    left(coalesce(topic, ''), 80),
    'Sent from the contact form',
    left(trim(message), 4000)
  )
  returning ref into new_ref;
  return new_ref;
end;
$$;

grant execute on function public.submit_contact_message(text, text, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wishlist share links keep the snapshot the parent chose to share
-- ---------------------------------------------------------------------------

alter table public.wishlist_shares add column owner_name text not null default '' check (char_length(owner_name) <= 60);
alter table public.wishlist_shares add column scope text not null default 'link' check (scope in ('link', 'invite'));
alter table public.wishlist_shares add column initials boolean not null default false;
alter table public.wishlist_shares add column expiry text not null default '30';
alter table public.wishlist_shares add column expires_at timestamptz;
alter table public.wishlist_shares add column items jsonb not null default '[]'::jsonb;
alter table public.wishlist_shares add column updated_at timestamptz not null default now();
alter table public.wishlist_shares add constraint wishlist_shares_token_check check (token ~ '^[a-z0-9]{6,40}$');

drop function public.get_shared_wishlist(text);

-- Anyone with the link. Expired links say when they expired but show no books.
create function public.get_shared_wishlist(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'token', s.token,
    'ownerName', s.owner_name,
    'scope', s.scope,
    'initials', s.initials,
    'expiry', s.expiry,
    'created', (extract(epoch from s.created_at) * 1000)::bigint,
    'updated', (extract(epoch from s.updated_at) * 1000)::bigint,
    'expires', (extract(epoch from s.expires_at) * 1000)::bigint,
    'items', case when s.expires_at is not null and s.expires_at < now() then '[]'::jsonb else s.items end
  )
  from public.wishlist_shares s
  join public.profiles p on p.id = s.owner_id
  where s.token = share_token
    and s.revoked_at is null
    and p.status = 'active';
$$;

grant execute on function public.get_shared_wishlist(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin console: account list with shelf sizes
-- ---------------------------------------------------------------------------

create function public.admin_accounts()
returns table (
  id uuid, email text, name text, role text, status text,
  created_at timestamptz, last_seen_at timestamptz, children integer, books integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.role, p.status, p.created_at, p.last_seen_at,
         (select count(*)::integer from public.children c where c.parent_id = p.id),
         (select count(*)::integer from public.books b where b.owner_id = p.id and b.list = 'shelf')
  from public.profiles p
  where public.is_admin()
  order by p.created_at desc;
$$;

revoke execute on function public.admin_accounts() from public, anon;

-- ---------------------------------------------------------------------------
-- "Delete my account": removes the login and, through the links between
-- tables, every shelf, child, book, message and setting that belongs to it.
-- ---------------------------------------------------------------------------

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
