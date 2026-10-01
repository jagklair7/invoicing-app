-- Supabase database schema for invoicing + payroll upgrade

-- Enable UUID generation functions
create extension if not exists "pgcrypto";

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_monthly numeric(10,2) default 0,
  price_annual numeric(10,2) default 0,
  max_employees int default 0,
  max_invoices int default -1,
  max_orgs int default 1,
  features jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table plans enable row level security;

drop policy if exists "Super admins can select plans" on plans;
create policy "Authenticated users can view plans" on plans
  for select
  using (
    auth.uid() is not null
  );

drop policy if exists "Super admins can manage plans" on plans;
create policy "Super admins can manage plans" on plans
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );

create table if not exists org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  plan_id uuid references plans(id),
  status text default 'active',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  unique(org_id)
);

alter table org_subscriptions enable row level security;

drop policy if exists "Super admins can manage subscriptions" on org_subscriptions;
create policy "Super admins can manage subscriptions" on org_subscriptions
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );

drop policy if exists "Organization members can select subscriptions" on org_subscriptions;
create policy "Organization members can select subscriptions" on org_subscriptions
  for select
  using (
    exists (
      select 1 from organization_members
      where organization_members.org_id = org_subscriptions.org_id
        and organization_members.user_id = auth.uid()
    )
  );

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  pay_type text default 'hourly',
  pay_rate numeric(10,2) default 0,
  pay_frequency text default 'biweekly',
  province text default 'AB',
  td1_credits numeric(10,2) default 15705,
  start_date date,
  status text default 'active',
  created_at timestamptz default now()
);

alter table employees enable row level security;

drop policy if exists "Organization members can manage employees" on employees;
create policy "Organization members can select employees" on employees
  for select
  using (
    exists (
      select 1 from organization_members
      where organization_members.org_id = employees.org_id
        and organization_members.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can insert employees" on employees;
create policy "Organization members can insert employees" on employees
  for insert
  with check (
    exists (
      select 1 from organization_members
      where organization_members.org_id = employees.org_id
        and organization_members.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can update employees" on employees;
create policy "Organization members can update employees" on employees
  for update
  using (
    exists (
      select 1 from organization_members
      where organization_members.org_id = employees.org_id
        and organization_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from organization_members
      where organization_members.org_id = employees.org_id
        and organization_members.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members can delete employees" on employees;
create policy "Organization members can delete employees" on employees
  for delete
  using (
    exists (
      select 1 from organization_members
      where organization_members.org_id = employees.org_id
        and organization_members.user_id = auth.uid()
    )
  );

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text default 'draft',
  total_gross numeric(10,2) default 0,
  total_deductions numeric(10,2) default 0,
  total_net numeric(10,2) default 0,
  created_at timestamptz default now()
);

create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid references payroll_runs(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  employee_id uuid references employees(id),
  hours_worked numeric(6,2),
  gross numeric(10,2) default 0,
  cpp numeric(10,2) default 0,
  ei numeric(10,2) default 0,
  federal_tax numeric(10,2) default 0,
  provincial_tax numeric(10,2) default 0,
  net numeric(10,2) default 0,
  ytd_gross numeric(10,2) default 0,
  ytd_cpp numeric(10,2) default 0,
  ytd_ei numeric(10,2) default 0,
  ytd_tax numeric(10,2) default 0,
  created_at timestamptz default now()
);

-- Seed default plan tiers
insert into plans (name, price_monthly, price_annual, max_employees, max_invoices, max_orgs, features) values
  ('free',       0,     0,     0,  5,  1, '{"payroll":false,"pay_stub_pdf":false,"ytd":false,"t4":false,"multi_org":false}'),
  ('starter',    29,    290,   5,  50, 1, '{"payroll":true,"pay_stub_pdf":true,"ytd":false,"t4":false,"multi_org":false}'),
  ('pro',        79,    790,   25, -1, 5, '{"payroll":true,"pay_stub_pdf":true,"ytd":true,"t4":false,"multi_org":true}'),
  ('enterprise', 199,    1990, -1,  -1, -1,'{"payroll":true,"pay_stub_pdf":true,"ytd":true,"t4":true,"multi_org":true}')
on conflict (name) do nothing;

-- Assign existing organizations to the free plan if needed
insert into org_subscriptions (org_id, plan_id)
select o.id, p.id
from organizations o
cross join plans p
where p.name = 'free'
on conflict (org_id) do nothing;
