drop policy if exists companies_read on public.companies;

create policy companies_read on public.companies for select to authenticated
  using (active and (
    app_private.has_company_access(id)
    or app_private.is_active_employee(id)
  ));
