-- 20260922000004_add_invoice_public_token.sql
-- Feature: public "Pay Now" link for sent invoices (mirrors the Quotes
-- public-token pattern: "public shareable links via customer token").
--
-- ASSUMPTIONS FLAGGED:
--   1. I don't have your actual Quotes public-token implementation
--      (QuotePublic.jsx / whatever RPC or view it reads from), so this is
--      built fresh rather than copying that pattern exactly. If Quotes
--      already has a security-definer RPC or a public view you use for
--      /q/:token, tell me and I'll switch this to match it precisely
--      instead of maintaining two different patterns for the same thing.
--   2. organization_settings column names (company_name, gst_number,
--      company_address, company_city, company_phone) are copied from the
--      select in InvoiceView.jsx's fetchInvoice — verified against that
--      file, not guessed.
--   3. Grants execute to both anon and authenticated since the public page
--      is unauthenticated by design (same as /q/:token).

begin;

alter table invoices
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists idx_invoices_public_token
  on invoices (public_token);

-- Security-definer function: safe, minimal read for the public pay page.
-- Runs with the privileges of the function owner (bypassing RLS on the
-- underlying tables), but only ever returns data for the single invoice
-- matching the token, and only the columns listed below.
create or replace function get_invoice_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', i.id,
      'number', i.number,
      'date', i.date,
      'due_date', i.due_date,
      'status', i.status,
      'subtotal', i.subtotal,
      'tax', i.tax,
      'total', i.total,
      'notes', i.notes,
      'online_payment_enabled', i.online_payment_enabled
    ),
    'customer', jsonb_build_object(
      'name', c.name,
      'email', c.email
    ),
    'org', jsonb_build_object(
      'company_name', os.company_name,
      'gst_number', os.gst_number,
      'company_address', os.company_address,
      'company_city', os.company_city,
      'company_phone', os.company_phone
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', ii.name,
        'quantity', ii.quantity,
        'unit_price', ii.unit_price
      )), '[]'::jsonb)
      from invoice_items ii
      where ii.invoice_id = i.id
    )
  )
  into result
  from invoices i
  left join customers c on c.id = i.customer_id
  left join organization_settings os on os.org_id = i.org_id
  where i.public_token = p_token;

  return result;
end;
$$;

grant execute on function get_invoice_by_token(uuid) to anon, authenticated;

commit;
