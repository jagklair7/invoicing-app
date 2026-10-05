-- Custom plans: features live on a per-org plans row; deal terms live on org_subscriptions.

alter table plans
  add column if not exists is_custom boolean not null default false,
  add column if not exists custom_for_org_id uuid references organizations(id) on delete cascade,
  add column if not exists base_plan_name text;

alter table plans drop constraint if exists plans_custom_has_org_check;
alter table plans add constraint plans_custom_has_org_check
  check (is_custom = false or custom_for_org_id is not null);

create index if not exists plans_custom_for_org_idx on plans (custom_for_org_id);

alter table org_subscriptions
  add column if not exists custom_price numeric(10,2),
  add column if not exists custom_currency text not null default 'CAD',
  add column if not exists billing_interval text,
  add column if not exists billing_notes text;

alter table org_subscriptions drop constraint if exists org_subscriptions_billing_interval_check;
alter table org_subscriptions add constraint org_subscriptions_billing_interval_check
  check (billing_interval is null or billing_interval in ('monthly','yearly'));

-- Custom plans are visible only to members of the org they belong to.
-- (Super admins still see everything through "Super admins can manage plans".)
drop policy if exists "Authenticated users can view plans" on plans;
create policy "Authenticated users can view plans" on plans
  for select
  using (
    auth.uid() is not null
    and (
      is_custom = false
      or custom_for_org_id in (
        select org_id from organization_members where user_id = auth.uid()
      )
    )
  );

-- Creates (or updates) a custom plan for one org and points its subscription at it.
-- Callable by super admins from the app, or from the SQL editor.
create or replace function public.create_custom_plan(
  p_org_id        uuid,
  p_base_plan     text,
  p_price         numeric,
  p_interval      text,
  p_period_end    timestamptz,
  p_max_employees int   default null,
  p_max_invoices  int   default null,
  p_max_orgs      int   default null,
  p_features      jsonb default null,
  p_notes         text  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base    plans%rowtype;
  v_plan_id uuid;
  v_monthly numeric(10,2);
begin
  -- auth.uid() is null when run from the SQL editor / service role; execute is not granted to anon.
  if auth.uid() is not null and not exists (
    select 1 from profiles where id = auth.uid() and is_super_admin = true
  ) then
    raise exception 'Only super admins can create custom plans';
  end if;

  if p_interval not in ('monthly','yearly') then
    raise exception 'p_interval must be monthly or yearly';
  end if;

  select * into v_base from plans where name = p_base_plan and is_custom = false;
  if not found then
    raise exception 'Base plan % not found', p_base_plan;
  end if;

  v_monthly := case when p_interval = 'yearly' then round(p_price / 12, 2) else p_price end;

  select id into v_plan_id from plans where custom_for_org_id = p_org_id and is_custom = true;

  if v_plan_id is null then
    insert into plans (name, price_monthly, max_employees, max_invoices, max_orgs, features,
                       is_custom, custom_for_org_id, base_plan_name)
    values (
      'custom-' || left(p_org_id::text, 8),
      v_monthly,
      coalesce(p_max_employees, v_base.max_employees),
      coalesce(p_max_invoices,  v_base.max_invoices),
      coalesce(p_max_orgs,      v_base.max_orgs),
      coalesce(v_base.features, '{}'::jsonb) || coalesce(p_features, '{}'::jsonb),
      true, p_org_id, p_base_plan
    )
    returning id into v_plan_id;
  else
    update plans set
      price_monthly  = v_monthly,
      max_employees  = coalesce(p_max_employees, max_employees),
      max_invoices   = coalesce(p_max_invoices,  max_invoices),
      max_orgs       = coalesce(p_max_orgs,      max_orgs),
      features       = coalesce(features, '{}'::jsonb) || coalesce(p_features, '{}'::jsonb),
      base_plan_name = p_base_plan
    where id = v_plan_id;
  end if;

  update org_subscriptions set
    plan_id            = v_plan_id,
    status             = 'active',
    current_period_end = p_period_end,
    custom_price       = p_price,
    billing_interval   = p_interval,
    billing_notes      = p_notes
  where org_id = p_org_id;

  if not found then
    insert into org_subscriptions (org_id, plan_id, status, current_period_end,
                                   custom_price, billing_interval, billing_notes)
    values (p_org_id, v_plan_id, 'active', p_period_end, p_price, p_interval, p_notes);
  end if;

  return v_plan_id;
end;
$$;

revoke execute on function public.create_custom_plan(uuid, text, numeric, text, timestamptz, int, int, int, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_custom_plan(uuid, text, numeric, text, timestamptz, int, int, int, jsonb, text)
  to authenticated, service_role;