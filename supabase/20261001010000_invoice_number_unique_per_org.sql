-- Invoice numbers only need to be unique within an organization
alter table invoices drop constraint if exists invoices_number_key;
alter table invoices add constraint invoices_org_number_key unique (org_id, number);