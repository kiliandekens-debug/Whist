begin;
create table public.whist_account_access (
  email text primary key check (email = lower(email)),
  owner_id text not null unique
);
alter table public.whist_account_access enable row level security;
revoke all on public.whist_account_access from public, anon, authenticated, service_role;
grant select on public.whist_account_access to service_role;
commit;
