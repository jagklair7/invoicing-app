-- Org default tax. Existing orgs default to GST 5%, i.e. today's behavior.
alter table organization_settings
  add column if not exists tax_name text not null default 'GST',
  add column if not exists tax_pct numeric not null default 5,
  add column if not exists tax2_name text,
  add column if not exists tax2_pct numeric not null default 0;

-- Tax snapshot on each invoice. NULL = invoice created before this change,
-- which every screen treats as the legacy 5% GST.
alter table invoices
  add column if not exists tax_name text,
  add column if not exists tax_pct numeric,
  add column if not exists tax2_name text,
  add column if not exists tax2_pct numeric;