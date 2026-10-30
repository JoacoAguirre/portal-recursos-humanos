create or replace function app_private.record_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if row(old.first_name, old.last_name, old.contact_email, old.employee_number, old.company_id, old.department,
      old.position, old.phone, old.address, old.hire_date, old.employment_status)
     is distinct from
     row(new.first_name, new.last_name, new.contact_email, new.employee_number, new.company_id, new.department,
      new.position, new.phone, new.address, new.hire_date, new.employment_status) then
    insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), new.company_id, 'profile.updated', 'profile', new.id,
      jsonb_build_object('changed', array_remove(array[
        case when old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name then 'name' end,
        case when old.contact_email is distinct from new.contact_email then 'contact_email' end,
        case when old.employee_number is distinct from new.employee_number then 'employee_number' end,
        case when old.company_id is distinct from new.company_id then 'company' end,
        case when old.department is distinct from new.department then 'department' end,
        case when old.position is distinct from new.position then 'position' end,
        case when old.phone is distinct from new.phone then 'phone' end,
        case when old.address is distinct from new.address then 'address' end,
        case when old.hire_date is distinct from new.hire_date then 'hire_date' end,
        case when old.employment_status is distinct from new.employment_status then 'employment_status' end
      ], null)));
  end if;
  return new;
end;
$$;

create or replace function public.complete_my_profile(
  p_first_name text,
  p_last_name text,
  p_contact_email text,
  p_phone text,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from app_private.user_roles where user_id = auth.uid()
  ) then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  if p_first_name is null or length(trim(p_first_name)) not between 1 and 100
     or p_last_name is null or length(trim(p_last_name)) not between 1 and 100
     or (p_contact_email is not null and (
       length(p_contact_email) > 254
       or p_contact_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     ))
     or (p_phone is not null and length(p_phone) > 40)
     or (p_address is not null and length(p_address) > 300) then
    raise exception 'Los datos personales no son válidos' using errcode = '23514';
  end if;

  update public.profiles
  set first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      contact_email = nullif(trim(p_contact_email), ''),
      phone = nullif(trim(p_phone), ''),
      address = nullif(trim(p_address), ''),
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'No existe un perfil para esta cuenta' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.complete_my_profile(text, text, text, text, text) from public, anon;
grant execute on function public.complete_my_profile(text, text, text, text, text) to authenticated;
