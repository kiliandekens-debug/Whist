-- Read-only follow link: lets anyone holding the link watch the current game.
-- Run once in the Supabase SQL editor.
begin;

create table public.whist_share (
  owner_id text primary key,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.whist_share enable row level security;
revoke all on public.whist_share from public, anon, authenticated, service_role;

-- The notebook of the signed-in owner, found the same way as the storage function does.
create function public.whist_share_owner() returns text
language sql stable security definer set search_path = '' as $$
  select a.owner_id
  from auth.users u
  join public.whist_account_access a on a.email = lower(u.email)
  where u.id = auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
$$;
revoke all on function public.whist_share_owner() from public, anon, authenticated;

-- action: 'get' returns the current link token, 'create' makes one if needed, 'revoke' removes it.
create function public.whist_share_link(action text default 'get') returns text
language plpgsql security definer set search_path = '' as $$
declare
  owner text := public.whist_share_owner();
  result text;
begin
  if owner is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if action = 'revoke' then
    delete from public.whist_share where owner_id = owner;
    return null;
  end if;
  if action = 'create' then
    insert into public.whist_share (owner_id, token)
    values (owner, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (owner_id) do nothing;
  end if;
  select s.token into result from public.whist_share s where s.owner_id = owner;
  return result;
end
$$;
revoke all on function public.whist_share_link(text) from public, anon;
grant execute on function public.whist_share_link(text) to authenticated;

-- What a follow link shows: the game in progress and the last finished one. Nothing else.
create function public.whist_shared(share_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'revision', s.revision,
    'active', s.snapshot -> 'active',
    'last', s.snapshot -> 'history' -> 0)
  from public.whist_share h
  join public.whist_state s on s.owner_id = h.owner_id
  where share_token ~ '^[0-9a-f]{64}$' and h.token = share_token
$$;
revoke all on function public.whist_shared(text) from public;
grant execute on function public.whist_shared(text) to anon, authenticated;

commit;
