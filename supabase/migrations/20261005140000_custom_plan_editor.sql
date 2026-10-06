-- Friendly display name for custom plans + a single save function for the admin editor.

alter table plans add column if not exists display_name text;

-- Backfill existing custom plans: "<org name> Custom"
update plans p
set display_name = o.name || ' Custom'
from organizations o
where p.is_custom = true
  and p.custom_for_org_id = o.id
  and p.display_name is null;

-- Creates or edits an org's custom plan. Unlike create_custom_plan, features are REPLACED
-- (so a toggle can be turned off) and every field is explicit.
--   * New plan: attaches it to the org's subscription; p_period_end is required.
--   * Existing plan: updates plan + deal terms. current_period_end changes only if p_period_end is given.
--     It does not re-attach an org that already dropped to Free; use renew_custom_plan for that.
create or replace function public.save_custom_plan(
  p_org_id        uuid,
  p_base_plan     text,
  p_display_name  text,
  p_price         numeric,
  p_interval      text,
  p_max_employees int,
  p_max_invoices  int,
  p_max_orgs      int,
  p_features      jsonb,
  p_notes         text,
  p_period_end    timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_monthly numeric(10,2);
begin
  if auth.uid() is not null and not exists (
    select 1 from profiles where id = auth.uid() and is_super_admin = true
  ) then
    raise exception 'Only super admins can save custom plans';
  end if;

  if p_interval not in ('monthly','yearly') then
    raise exception 'Interval must be monthly or yearly';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price must be 0 or more';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'Display name is required';
  end if;
  if not exists (select 1 from plans where name = p_base_plan and is_custom = false) then
    raise exception 'Base plan % not found', p_base_plan;
  end if;

  v_monthly := case when p_interval = 'yearly' then round(p_price / 12, 2) else p_price end;

  select id into v_plan_id from plans where custom_for_org_id = p_org_id and is_custom = true;

  if v_plan_id is null then
    if p_period_end is null then
      raise exception 'Period end is required when creating a custom plan';
    end if;

    insert into plans (name, display_name, price_monthly, max_employees, max_invoices, max_orgs,
                       features, is_custom, custom_for_org_id, base_plan_name)
    values ('custom-' || left(p_org_id::text, 8), trim(p_display_name), v_monthly,
            p_max_employees, p_max_invoices, p_max_orgs,
            coalesce(p_features, '{}'::jsonb), true, p_org_id, p_base_plan)
    returning id into v_plan_id;

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
  else
    update plans set
      display_name   = trim(p_display_name),
      price_monthly  = v_monthly,
      max_employees  = p_max_employees,
      max_invoices   = p_max_invoices,
      max_orgs       = p_max_orgs,
      features       = coalesce(p_features, '{}'::jsonb),
      base_plan_name = p_base_plan
    where id = v_plan_id;

    update org_subscriptions set
      custom_price       = p_price,
      billing_interval   = p_interval,
      billing_notes      = p_notes,
      current_period_end = coalesce(p_period_end, current_period_end)
    where org_id = p_org_id;
  end if;

  return v_plan_id;
end;
$$;

revoke execute on function public.save_custom_plan(uuid, text, text, numeric, text, int,