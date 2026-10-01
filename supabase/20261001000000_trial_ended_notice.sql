-- Track when a trial ended and whether the "trial ended" email went out
alter table org_subscriptions
  add column if not exists trial_ended_at timestamptz,
  add column if not exists trial_ended_email_sent_at timestamptz;

-- Same as the guarded version, plus it now records trial_ended_at.
-- Returns how many subscriptions were downgraded.
create or replace function expire_pro_trials()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  free_plan_id uuid;
  pro_plan_id uuid;
  expired_count integer;
begin
  select id into free_plan_id from plans where name = 'free' limit 1;
  select id into pro_plan_id from plans where name = 'pro' limit 1;
  if free_plan_id is null or pro_plan_id is null then
    raise exception 'Free or Pro plan not found';
  end if;

  with expired as (
    update org_subscriptions
    set plan_id = free_plan_id,
        trial_ends_at = null,
        trial_ended_at = now(),
        trial_ended_email_sent_at = null
    where trial_ends_at is not null
      and trial_ends_at < now()
      and plan_id = pro_plan_id
      and helcim_transaction_id is null
    returning id
  )
  select count(*) into expired_count from expired;

  return expired_count;
end;
$$;

revoke execute on function expire_pro_trials() from public, anon, authenticated;
grant execute on function expire_pro_trials() to service_role;