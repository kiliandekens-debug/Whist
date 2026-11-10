begin;

create table public.whist_state (
  owner_id text primary key,
  revision integer not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object')
);

create table public.whist_site_access (
  name text primary key,
  token_digest text not null check (token_digest ~ '^[0-9a-f]{64}$')
);

alter table public.whist_state enable row level security;
alter table public.whist_site_access enable row level security;

revoke all on public.whist_state, public.whist_site_access from public, anon, authenticated, service_role;
grant select, insert, update on public.whist_state to service_role;
grant select on public.whist_site_access to service_role;

commit;
