-- Parents Go To: stop the website calling internal functions directly.
-- Fixes Security Advisor warnings "Function can be executed by anon /
-- authenticated role" for functions that only the database itself uses.
-- Triggers keep working: Postgres checks EXECUTE only when a trigger is
-- created, not each time it fires.

-- Trigger functions: never called from the website.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.add_thread_owner() from public, anon, authenticated;
revoke execute on function public.touch_thread() from public, anon, authenticated;
revoke execute on function public.announce_support_ticket() from public, anon, authenticated;
revoke execute on function public.audit_profile_change() from public, anon, authenticated;
revoke execute on function public.announce_pending() from public, anon, authenticated;

-- Security-rule helpers: signed-in users need them for their own rules,
-- signed-out visitors never do.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active() from public, anon;
revoke execute on function public.can_view_shelf(uuid) from public, anon;
revoke execute on function public.is_thread_member(uuid) from public, anon;
revoke execute on function public.is_thread_owner(uuid) from public, anon;

-- Signed-in only.
revoke execute on function public.accept_family_invite(text) from public, anon;

-- Intentionally callable by everyone (the warnings for these are expected):
--   submit_contact_message, subscribe, get_shared_wishlist
