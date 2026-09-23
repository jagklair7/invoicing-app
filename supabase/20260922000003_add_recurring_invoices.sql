-- 20260922000003_add_recurring_invoices.sql
-- Feature: recurring invoices. Each cycle, the cron generates + sends a real
-- invoice from the template. No auto-charge — customer pays manually via
-- Pay Now (if online_payment_enabled) same as any other invoice.
--
-- RLS INTENTIONALLY DEFERRED: the previous version of this migration guessed
-- a membership helper (is_org_member) that doesn't exist in this schema —
-- confirmed by the "function does not exist" error when run. Rather than
-- guess a second name, this version enables RLS on the table but adds no
-- policies yet, so it currently has NO row-level access rules at all (an
-- authenticated user could read/write any org's rows if the app relied only
-- on this table's own RLS — the app-level org_id filtering in
-- RecurringInvoices.jsx still scopes queries by org_id, so this is not
-- wide open in practice, but it is not properly tenant-isolated yet).
-- Run check_rls_pattern.sql (delivered separately) and share the output —
-- the follow-up migration 20260922000005_add_recurring_invoices_rls.sql
-- will add the real policies once we have your actual pattern.

begin;

create table if not exists recurring_invoice_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,

  frequency text not null
    check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annually')),

  next_run_date date not null,
  start_date date not null default current_date,
  end_date date, -- null = runs indefinitely until deactivated

  active boolean not null default true,

  line_items jsonb not null,       -- same shape as invoices.line_items
  invoice_number_prefix text,
  notes text,
  online_payment_enabled boolean not null default false,

  last_generated_invoice_id uuid references invoices(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table invoices
  add column if not exists recurring_template_id uuid
    references recurring_invoice_templates(id) on delete set null;

alter table recurring_invoice_templates enable row level security;

-- No policies yet — see note above. Table is otherwise fully created and
-- usable by the app (which filters by org_id itself); just not yet
-- database-enforced tenant-isolated.

create index if not exists idx_recurring_templates_due
  on recurring_invoice_templates (next_run_date)
  where active = true;

commit;
