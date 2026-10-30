drop policy if exists profiles_read on public.profiles;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or app_private.can_view_employee(id, company_id));
