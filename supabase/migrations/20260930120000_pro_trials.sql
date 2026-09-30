-- Trial tracking on the existing subscription row
alter table org_subscriptions
  add column if not exists trial_used boolean not null default false,
  add column if not exists trial_warning_sent_at timestamptz;

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
-- No member INSERT/UPDATE/DELETE policies on purpose: writes go through
-- the Edge Functions (service role) only.
drop policy if exists trial_requests_select on trial_requests;
create policy trial_requests_select on trial_requests
  for select
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));

drop policy if exists "Super admins can manage trial requests" on trial_requests;
create policy "Super admins can manage trial requests" on trial_requests
  for all
  using (exists (
    select 1 from profiles where profiles.id = auth.uid() and profiles.is_super_admin = true
  ))
  with check (exists (
    select 1 from profiles where profiles.id = auth.uid() and profiles.is_super_admin = true
  ));

-- Downgrades expired, unpaid trials back to Free. Called by a scheduled job.
-- Returns how many subscriptions were downgraded.
create or replace function expire_pro_trials()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  free_plan_id uuid;
  expired_count integer;
begin
  select id into free_plan_id from plans where name = 'free' limit 1;
  if free_plan_id is null then
    raise exception 'Free plan not found';
  end if;

  with expired as (
    update org_subscriptions
    set plan_id = free_plan_id,
        trial_ends_at = null
    where trial_ends_at is not null
      and trial_ends_at < now()
      and helcim_transaction_id is null
    returning id
  )
  select count(*) into expired_count from expired;

  return expired_count;
end;
$$;

revoke execute on function expire_pro_trials() from public, anon, authenticated;
grant execute on function expire_pro_trials() to service_role;