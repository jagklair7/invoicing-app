-- 20260922000002_add_payment_methods_toggle.sql
-- Feature: Pay Now (Helcim) button, toggled per invoice before sending.
-- Simplified per scope decision: online payment = credit card via Helcim only,
-- no direct deposit / no org-level payment settings table needed.

begin;

alter table invoices
  add column if not exists online_payment_enabled boolean not null default false;

commit;
