-- 20260922000005_add_recurring_invoices_rls.sql
-- Adds the real RLS policies to recurring_invoice_templates, deferred from
-- 20260922000003 pending confirmation of the actual membership pattern.
--
-- Confirmed via pg_policies against customers/invoice_items/invoices/products:
--   - membership check: org_id IN (select org_id from organization_members
--     where user_id = auth.uid())
--   - suspension check: is_org_suspended(org_id), blocking insert/update/delete
--     (not select) — matches customers/invoice_items/products exactly.
--     (invoices additionally has an ALL-command block via org_subscriptions
--     directly, which looks like an older/parallel mechanism to
--     is_org_suspended — not replicated here since every other table only
--     uses is_org_suspended; flag if recurring templates should also block
--     on org_subscriptions.status = 'suspended' directly.)
--   - naming convention: "<table>_select" / "_insert" / "_update" / "_delete"
--     for membership policies, "block_<verb>_when_suspended" for suspension.

begin;

create policy "recurring_invoice_templates_select"
  on recurring_invoice_templates for select
  using (org_id in (select organization_members.org_id from organization_members where organization_members.user_id = auth.uid()));

create policy "recurring_invoice_templates_insert"
  on recurring_invoice_templates for insert
  with check (org_id in (select organization_members.org_id from organization_members where organization_members.user_id = auth.uid()));

create policy "recurring_invoice_templates_update"
  on recurring_invoice_templates for update
  using (org_id in (select organization_members.org_id from organization_members where organization_members.user_id = auth.uid()))
  with check (org_id in (select organization_members.org_id from organization_members where organization_members.user_id = auth.uid()));

create policy "recurring_invoice_templates_delete"
  on recurring_invoice_templates for delete
  using (org_id in (select organization_members.org_id from organization_members where organization_members.user_id = auth.uid()));

create policy "block_insert_when_suspended"
  on recurring_invoice_templates for insert
  with check (not is_org_suspended(org_id));

create policy "block_update_when_suspended"
  on recurring_invoice_templates for update
  using (not is_org_suspended(org_id))
  with check (not is_org_suspended(org_id));

create policy "block_delete_when_suspended"
  on recurring_invoice_templates for delete
  using (not is_org_suspended(org_id));

commit;
