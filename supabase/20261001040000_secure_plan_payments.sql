-- 1. Server-only record of each plan checkout (including Helcim's secret token).
--    RLS is on with NO policies, so only the service role (our API routes) can touch it.
create table if not exists helcim_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references plans(id),
  org_name text not null,
  checkout_token text not null unique,
  secret_token text not null,
  base_amount numeric(10,2) not null,
  gst_amount numeric(10,2) not null,
  amount numeric(10,2) not null,
  status text not null default 'created' check (status in ('created', 'verified')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table helcim_checkouts enable row level security;

-- 2. pending_org_payments: verified flag + link back to the checkout.
alter table pending_org_payments
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists checkout_id uuid references helcim_checkouts(id);

-- A Helcim transaction can back at most one payment record.
create unique index if not exists pending_org_payments_txn_unique
  on pending_org_payments (helcim_transaction_id)
  where helcim_transaction_id is not null;

-- 3. Lock the table down: drop every existing policy, then allow only
--    "see my own rows" and super-admin management. No browser inserts.
alter table pending_org_payments enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pending_org_payments'
  loop
    execute format('drop policy %I on public.pending_org_payments', r.policyname);
  end loop;
end $$;

create policy pending_org_payments_select_own on pending_org_payments
  for select
  using (user_id = auth.uid());

create policy "Super admins can manage pending payments" on pending_org_payments
  for all
  using (exists (
    select 1 from profiles where profiles.id = auth.uid() and profiles.is_super_admin = true
  ))
  with check (exists (
    select 1 from profiles where profiles.id = auth.uid() and profiles.is_super_admin = true
  ));

-- 4. Only verified payments can become organizations.
create or replace function public.resolve_pending_org_payment(pending_payment_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pending pending_org_payments%ROWTYPE;
  new_org organizations%ROWTYPE;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into pending from pending_org_payments
  where id = pending_payment_id and user_id = auth.uid();

  if pending is null then
    raise exception 'Pending payment not found';
  end if;
  if pending.status = 'completed' then
    raise exception 'This payment has already been used to create an organization';
  end if;
  if pending.status = 'refunded' then
    raise exception 'This payment has been refunded';
  end if;
  if not pending.verified then
    raise exception 'This payment has not been verified yet';
  end if;

  insert into organizations (name, owner_id)
  values (pending.org_name, auth.uid())
  returning * into new_org;

  insert into organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  insert into organization_settings (org_id, company_name, invoice_prefix)
  values (new_org.id, pending.org_name, 'INV-');

  insert into org_subscriptions (
    org_id, plan_id, status, helcim_transaction_id,
    purchased_amount, gst_amount, total_charged, purchased_at
  )
  values (
    new_org.id, pending.plan_id, 'active',
    pending.helcim_transaction_id,
    pending.base_amount, pending.gst_amount, pending.amount, pending.created_at
  );

  update pending_org_payments
  set status = 'completed', resolved_at = now()
  where id = pending.id;

  return row_to_json(new_org);
end;
$function$;

-- 5. Browsers can no longer create paid organizations directly. Paid orgs only
--    come from resolve_pending_org_payment, after the server verified the payment.
create or replace function public.create_organization(
  org_name text,
  plan_id uuid default null,
  helcim_transaction_id text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_org organizations%ROWTYPE;
  resolved_plan_id uuid;
  plan_price numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  resolved_plan_id := plan_id;
  if resolved_plan_id is null then
    select id into resolved_plan_id from plans where name = 'free' limit 1;
  end if;

  if resolved_plan_id is not null then
    select price_monthly into plan_price from plans where id = resolved_plan_id;
    if coalesce(plan_price, 0) > 0 then
      raise exception 'Paid plans must be purchased through checkout';
    end if;
  end if;

  insert into organizations (name, owner_id)
  values (org_name, auth.uid())
  returning * into new_org;

  insert into organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  insert into organization_settings (org_id, company_name, invoice_prefix)
  values (new_org.id, org_name, 'INV-');

  if resolved_plan_id is not null then
    insert into org_subscriptions (org_id, plan_id, status)
    values (new_org.id, resolved_plan_id, 'active');
  end if;

  return row_to_json(new_org);
end;
$function$;