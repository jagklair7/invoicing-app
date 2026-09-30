-- Trial state on the org
alter table organizations
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_warning_sent_at timestamptz,
  add column if not exists trial_used boolean not null default false;

-- Requests awaiting admin approval
create table if not exists trial_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

-- Only one pending request per org
create unique index if not exists trial_requests_one_pending_per_org
  on trial_requests (org_id) where status = 'pending';

alter table trial_requests enable row level security;

-- Members can see their own org's requests.
-- No client INSERT/UPDATE/DELETE policies on purpose: writes go through
-- the Edge Functions (service role) only.
create policy trial_requests_select on trial_requests
  for select
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));

-- Expiry is enforced here, not by a job
create or replace function effective_plan(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.trial_ends_at is not null and o.trial_ends_at < now() then 'free'
    else o.plan
  end
  from organizations o
  where o.id = p_org_id;
$$;

revoke execute on function effective_plan(uuid) from public;
grant execute on function effective_plan(uuid) to authenticated, service_role;

-- OPTIONAL hardening (commented out, see note below):
-- create or replace function protect_plan_columns() returns trigger
-- language plpgsql as $$
-- begin
--   if current_user in ('authenticated', 'anon') and (
--        new.plan is distinct from old.plan
--     or new.trial_started_at is distinct from old.trial_started_at
--     or new.trial_ends_at is distinct from old.trial_ends_at
--     or new.trial_warning_sent_at is distinct from old.trial_warning_sent_at
--     or new.trial_used is distinct from old.trial_used
--   ) then
--     raise exception 'plan and trial columns can only be changed by the server';
--   end if;
--   return new;
-- end $$;
-- create trigger organizations_protect_plan_columns
--   before update on organizations
--   for each row execute function protect_plan_columns();