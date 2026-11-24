-- Time tracking: billable/non-billable hours, per org, optionally linked to an invoice.
-- RLS follows the existing pattern: membership via organization_members,
-- suspension via is_org_suspended(org_id), policies named "<table>_<verb>" and
-- "block_<verb>_when_suspended".

create table if not exists public.time_entries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid default auth.uid(),
  customer_id  uuid references public.customers(id) on delete set null,
  work_date    date not null default current_date,
  description  text not null,
  notes        text,
  hours        numeric(6,2) not null check (hours > 0),
  hourly_rate  numeric(10,2) not null default 0 check (hourly_rate >= 0),
  billable     boolean not null default true,
  -- Set when the entry is put on an invoice. If that invoice is deleted the
  -- entry becomes unbilled again; the app also treats voided invoices as unbilled.
  invoice_id   uuid references public.invoices(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists time_entries_org_date_idx
  on public.time_entries (org_id, work_date desc);
create index if not exists time_entries_org_invoice_idx
  on public.time_entries (org_id, invoice_id);

alter table public.time_entries enable row level security;

create policy "time_entries_select" on public.time_entries
  for select using (
    org_id in (select org_id from public.organization_members where user_id = auth.uid())
  );

create policy "time_entries_insert" on public.time_entries
  for insert with check (
    org_id in (select org_id from public.organization_members where user_id = auth.uid())
  );

create policy "time_entries_update" on public.time_entries
  for update using (
    org_id in (select org_id from public.organization_members where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.organization_members where user_id = auth.uid())
  );

create policy "time_entries_delete" on public.time_entries
  for delete using (
    org_id in (select org_id from public.organization_members where user_id = auth.uid())
  );

-- Suspended orgs are read-only (restrictive, so they apply on top of the above).
create policy "block_insert_when_suspended" on public.time_entries
  as restrictive for insert with check (not public.is_org_suspended(org_id));

create policy "block_update_when_suspended" on public.time_entries
  as restrictive for update using (not public.is_org_suspended(org_id));

create policy "block_delete_when_suspended" on public.time_entries
  as restrictive for delete using (not public.is_org_suspended(org_id));
