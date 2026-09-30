-- An explicit plan assignment (admin "Assign Plan", payment upgrade, refund)
-- ends any running trial, unless the same update also sets a new trial end
-- date (which is what decide-pro-trial and expire_pro_trials do).
create or replace function end_trial_on_plan_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.trial_ends_at is not distinct from old.trial_ends_at then
    new.trial_ends_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists org_subscriptions_end_trial_on_plan_assignment on org_subscriptions;
create trigger org_subscriptions_end_trial_on_plan_assignment
  before update of plan_id on org_subscriptions
  for each row
  execute function end_trial_on_plan_assignment();