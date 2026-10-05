-- Custom plan renewals: 7-day reminder before period end, 7-day grace after, then drop to Free.

alter table org_subscriptions
  add column if not exists renewal_reminder_for timestamptz,  -- the current_period_end a reminder was sent for
  add column if not exists custom_lapsed_at timestamptz;

-- Drops custom subscriptions to Free once current_period_end + 7 days has passed.
-- Only touches active subscriptions on custom plans. The custom plans row is kept so renewing is one call.
create or replace function public.expire_lapsed_custom_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  free_plan_id  uuid;
  expired_count integer;
begin
  select id into free_plan_id from plans where name = 'free' and is_custom = false limit 1;
  if free_plan_id is null then
    raise exception 'Free plan not found';
  end if;

  with lapsed as (
    update org_subscriptions s
    set plan_id          = free_plan_id,
        custom_lapsed_at = now()
    from plans p
    where p.id = s.plan_id
      and p.is_custom = true
      and s.status = 'active'
      and s.current_period_end is not null
      and s.current_period_end + interval '7 days' < now()
    returning s.id
  )
  select count(*) into expired_count from lapsed;

  return expired_count;
end;
$$;

revoke execute on function public.expire_lapsed_custom_plans() from public, anon, authenticated;
grant execute on function public.expire_lapsed_custom_plans() to service_role;

-- Call this when the customer pays. Extends by one billing interval.
-- On time or within grace: extends from the old period end so billing dates don't drift.
-- Fully lapsed (already dropped to Free): restarts from now and re-attaches the custom plan.
create or replace function public.renew_custom_plan(
  p_org_id   uuid,
  p_interval text default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub      org_subscriptions%rowtype;
  v_plan_id  uuid;
  v_interval text;
  v_base     timestamptz;
  v_new      timestamptz;
begin
  if auth.uid() is not null and not exists (
    select 1 from profiles where id = auth.uid() and is_super_admin = true
  ) then
    raise exception 'Only super admins can renew custom plans';
  end if;

  select * into v_sub from org_subscriptions where org_id = p_org_id;
  if not found then
    raise exception 'No subscription for org %', p_org_id;
  end if;

  select id into v_plan_id from plans where custom_for_org_id = p_org_id and is_custom = true;
  if v_plan_id is null then
    raise exception 'Org % has no custom plan', p_org_id;
  end if;

  v_interval := coalesce(p_interval, v_sub.billing_interval);
  if v_interval is null or v_interval not in ('monthly','yearly') then
    raise exception 'Billing interval must be monthly or yearly';
  end if;

  v_base := case
    when v_sub.plan_id = v_plan_id
     and v_sub.current_period_end is not null
     and v_sub.current_period_end + interval '7 days' >= now()
    then v_sub.current_period_end
    else now()
  end;

  v_new := case when v_interval = 'yearly' then v_base + interval '1 year'
                else v_base + interval '1 month' end;

  update org_subscriptions set
    plan_id            = v_plan_id,
    current_period_end = v_new,
    billing_interval   = v_interval,
    custom_lapsed_at   = null
  where org_id = p_org_id;

  return v_new;
end;
$$;

revoke execute on function public.renew_custom_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.renew_custom_plan(uuid, text) to authenticated, service_role;

-- Replaces the earlier version: converting a trial org to a custom plan now clears the trial
-- (so no stray "trial ends" email), and re-assigning clears any lapsed marker.
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
    billing_notes      = p_notes,
    trial_ends_at      = null,
    custom_lapsed_at   = null
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