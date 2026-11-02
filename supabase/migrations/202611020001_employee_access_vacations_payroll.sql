alter table public.profiles
  add column dni text;

alter table public.profiles
  add constraint profiles_dni_format
  check (dni is null or dni ~ '^[0-9]{7,8}$');

create unique index profiles_dni_unique
  on public.profiles (dni)
  where dni is not null;

create table public.employee_registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  dni text not null check (dni ~ '^[0-9]{7,8}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  employee_profile_id uuid references public.profiles(id) on delete restrict,
  company_id uuid references public.companies(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_registration_review_consistent check (
    (status = 'pending' and reviewed_at is null and employee_profile_id is null)
    or (status = 'rejected' and reviewed_at is not null and employee_profile_id is null)
    or (status = 'approved' and reviewed_at is not null and employee_profile_id is not null)
  )
);

create unique index employee_registration_pending_email_unique
  on public.employee_registration_requests (lower(email))
  where status = 'pending';
create unique index employee_registration_pending_dni_unique
  on public.employee_registration_requests (dni)
  where status = 'pending';
alter table public.employee_registration_requests enable row level security;
revoke all on public.employee_registration_requests from public, anon, authenticated;
grant all on public.employee_registration_requests to service_role;

create table public.payroll_slips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  pay_period date not null,
  storage_path text not null unique check (storage_path !~ '(^/|[.][.]|//)'),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (employee_id, pay_period)
);
create index payroll_slips_employee_period_idx
  on public.payroll_slips (employee_id, pay_period desc);
alter table public.payroll_slips enable row level security;
create policy payroll_slips_read on public.payroll_slips for select to authenticated
  using (
    pay_period >= (current_date - interval '1 year')::date
    and (employee_id = auth.uid() or app_private.can_manage_documents(company_id))
  );
create policy payroll_slips_admin_insert on public.payroll_slips for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and pay_period >= (current_date - interval '1 year')::date
    and app_private.can_manage_documents(company_id)
  );
revoke all on public.payroll_slips from anon, authenticated;
grant select on public.payroll_slips to authenticated;
grant insert (employee_id, company_id, pay_period, storage_path, uploaded_by)
  on public.payroll_slips to authenticated;

drop function public.create_employee_profile(uuid, uuid, text, text, text, text, text, text, text, date);

create function public.create_employee_profile(
  p_user_id uuid,
  p_company_id uuid,
  p_first_name text,
  p_last_name text,
  p_employee_number text,
  p_department text default null,
  p_position text default null,
  p_phone text default null,
  p_address text default null,
  p_hire_date date default null,
  p_dni text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  new_profile public.profiles%rowtype;
  auth_email text;
begin
  if auth.uid() is null or not app_private.can_manage_employees(p_company_id) then
    raise exception 'Acceso denegado para esta empresa' using errcode = '42501';
  end if;
  if p_first_name is null or length(trim(p_first_name)) not between 1 and 100
     or p_last_name is null or length(trim(p_last_name)) not between 1 and 100
     or p_employee_number is null or length(trim(p_employee_number)) not between 1 and 60
     or p_hire_date is null
     or p_dni is null or p_dni !~ '^[0-9]{7,8}$' then
    raise exception 'Los datos del empleado no son válidos' using errcode = '23514';
  end if;
  select email into auth_email from auth.users where id = p_user_id;
  if auth_email is null then
    raise exception 'No existe la cuenta invitada en Auth' using errcode = '23503';
  end if;
  if exists (select 1 from app_private.user_roles where user_id = p_user_id)
     or exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'La cuenta ya tiene un perfil asignado' using errcode = '23505';
  end if;

  insert into app_private.user_roles (user_id, role, created_by)
  values (p_user_id, 'EMPLEADO', auth.uid());
  insert into public.profiles (
    id, first_name, last_name, contact_email, employee_number, company_id,
    department, position, phone, address, hire_date, dni
  )
  values (
    p_user_id, trim(p_first_name), trim(p_last_name), auth_email, trim(p_employee_number), p_company_id,
    nullif(trim(p_department), ''), nullif(trim(p_position), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_address), ''), p_hire_date, p_dni
  )
  returning * into new_profile;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_company_id, 'employee.created', 'profile', p_user_id,
    jsonb_build_object('employee_number', new_profile.employee_number));
  return new_profile;
end;
$$;

revoke all on function public.create_employee_profile(uuid, uuid, text, text, text, text, text, text, text, date, text)
  from public, anon;
grant execute on function public.create_employee_profile(uuid, uuid, text, text, text, text, text, text, text, date, text)
  to authenticated;

create or replace function app_private.vacation_entitlement(p_hire_date date, p_year integer)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  year_end date := make_date(p_year, 12, 31);
begin
  if p_hire_date is null or p_hire_date + interval '6 months' > year_end then
    return 0;
  end if;
  if p_hire_date >= make_date(p_year - 5, 12, 31) then return 14; end if;
  if p_hire_date >= make_date(p_year - 10, 12, 31) then return 21; end if;
  if p_hire_date >= make_date(p_year - 20, 12, 31) then return 28; end if;
  return 35;
end;
$$;
revoke all on function app_private.vacation_entitlement(date, integer) from public, anon, authenticated;

create or replace function app_private.record_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if row(old.first_name, old.last_name, old.employee_number, old.company_id, old.department,
      old.position, old.phone, old.address, old.hire_date, old.employment_status, old.dni)
     is distinct from
     row(new.first_name, new.last_name, new.employee_number, new.company_id, new.department,
      new.position, new.phone, new.address, new.hire_date, new.employment_status, new.dni) then
    insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), new.company_id, 'profile.updated', 'profile', new.id,
      jsonb_build_object('changed', array_remove(array[
        case when old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name then 'name' end,
        case when old.employee_number is distinct from new.employee_number then 'employee_number' end,
        case when old.dni is distinct from new.dni then 'dni' end,
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

create or replace function app_private.enforce_request_calendar_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  employee_hire_date date;
  start_date date;
  end_date date;
  first_year integer;
  last_year integer;
  year_to_check integer;
  segment_days integer;
  reserved_days integer;
  entitlement integer;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  needs_hr_review boolean := false;
begin
  if new.request_type not in ('leave', 'vacation') then
    return new;
  end if;
  start_date := (new.payload->>'start_date')::date;
  if start_date < business_today + 30 then
    raise exception 'Las solicitudes deben presentarse con al menos 30 días de anticipación.'
      using errcode = '23514';
  end if;
  if new.request_type <> 'vacation' then
    return new;
  end if;

  end_date := (new.payload->>'end_date')::date;
  select hire_date into employee_hire_date
  from public.profiles where id = new.employee_id for update;
  first_year := extract(year from start_date)::integer;
  last_year := extract(year from end_date)::integer;

  for year_to_check in first_year..last_year loop
    entitlement := app_private.vacation_entitlement(employee_hire_date, year_to_check);
    if entitlement = 0 then
      needs_hr_review := true;
      continue;
    end if;

    segment_days :=
      least(end_date, make_date(year_to_check, 12, 31))
      - greatest(start_date, make_date(year_to_check, 1, 1)) + 1;
    select coalesce(sum(
      least((r.payload->>'end_date')::date, make_date(year_to_check, 12, 31))
      - greatest((r.payload->>'start_date')::date, make_date(year_to_check, 1, 1)) + 1
    ), 0)::integer
    into reserved_days
    from public.requests r
    where r.employee_id = new.employee_id
      and r.request_type = 'vacation'
      and r.status not in ('cancelled', 'rejected')
      and (r.payload->>'start_date')::date <= make_date(year_to_check, 12, 31)
      and (r.payload->>'end_date')::date >= make_date(year_to_check, 1, 1);
    if reserved_days + segment_days > entitlement then
      raise exception 'La solicitud supera los % días de vacaciones disponibles para el año %.',
        greatest(entitlement - reserved_days, 0), year_to_check
        using errcode = '23514';
    end if;
  end loop;

  if needs_hr_review then
    new.status := 'in_review';
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_request_calendar_rules() from public, anon, authenticated;

create trigger requests_enforce_calendar_rules
before insert on public.requests
for each row execute function app_private.enforce_request_calendar_rules();

create or replace function app_private.record_request_creation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.request_history (request_id, actor_id, previous_status, new_status, action)
  values (new.id, auth.uid(), null, new.status, 'created');

  insert into public.notifications (user_id, title, message, type, related_entity_id)
  select a.user_id,
    case when new.status = 'in_review' then 'Solicitud en revisión' else 'Nueva solicitud' end,
    case when new.status = 'in_review'
      then 'Hay una solicitud que requiere revisión de Recursos Humanos.'
      else 'Hay una nueva solicitud pendiente de revisión.'
    end,
    'request', new.id
  from public.user_company_access a
  where a.company_id = new.company_id
    and a.can_resolve_requests;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), new.company_id, 'request.created', 'request', new.id);
  return new;
end;
$$;

drop policy if exists requests_create_self on public.requests;
create policy requests_create_self on public.requests for insert to authenticated
  with check (
    employee_id = auth.uid()
    and app_private.is_active_employee(company_id)
    and status in ('pending', 'in_review')
    and resolved_at is null
    and resolved_by is null
    and version = 1
  );

create or replace function public.review_employee_registration(
  p_registration_id uuid,
  p_approve boolean,
  p_company_id uuid default null,
  p_employee_number text default null,
  p_hire_date date default null,
  p_existing_profile_id uuid default null,
  p_department text default null,
  p_position text default null
)
returns public.employee_registration_requests
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  registration public.employee_registration_requests%rowtype;
  target_profile public.profiles%rowtype;
  new_user_id uuid;
begin
  if auth.uid() is null
     or app_private.current_role() is null
     or app_private.current_role() not in ('RRHH_ADMIN', 'SUPERADMIN') then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  select * into registration
  from public.employee_registration_requests
  where id = p_registration_id and status = 'pending'
  for update;
  if not found then
    raise exception 'El registro ya fue procesado o no existe' using errcode = '23505';
  end if;
  if p_approve is null then
    raise exception 'La decisión no es válida' using errcode = '22023';
  end if;

  if not p_approve then
    if app_private.current_role() is distinct from 'SUPERADMIN'
       and not exists (
         select 1 from public.user_company_access
         where user_id = auth.uid() and can_manage_employees
       ) then
      raise exception 'No tenés permisos para gestionar altas de empleados' using errcode = '42501';
    end if;
    update public.employee_registration_requests
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_registration_id returning * into registration;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'registration.rejected', 'employee_registration', p_registration_id, '{}'::jsonb);
    return registration;
  end if;

  if p_company_id is null
     or not app_private.can_manage_employees(p_company_id) then
    raise exception 'No tenés permiso para administrar empleados en esa empresa' using errcode = '42501';
  end if;
  if p_existing_profile_id is null and (
    p_employee_number is null or length(trim(p_employee_number)) not between 1 and 60
    or p_hire_date is null
  ) then
    raise exception 'El número de legajo no es válido' using errcode = '23514';
  end if;
  if exists (select 1 from app_private.user_roles where user_id = registration.auth_user_id)
     or exists (select 1 from public.profiles where id = registration.auth_user_id) then
    raise exception 'La cuenta ya tiene un perfil asignado' using errcode = '23505';
  end if;
  if registration.auth_user_id is null then
    raise exception 'La cuenta asociada al registro ya no existe' using errcode = '23503';
  end if;
  new_user_id := registration.auth_user_id;

  if p_existing_profile_id is not null then
    select * into target_profile from public.profiles
    where id = p_existing_profile_id for update;
    if not found or target_profile.company_id is distinct from p_company_id
       or target_profile.dni is distinct from registration.dni
       or app_private.current_role() = 'RRHH_ADMIN' and not app_private.can_manage_employees(target_profile.company_id) then
      raise exception 'El legajo debe pertenecer a la empresa elegida y coincidir con el DNI' using errcode = '42501';
    end if;
    if (select role from app_private.user_roles where user_id = p_existing_profile_id) is distinct from 'EMPLEADO' then
      raise exception 'Solo se pueden vincular legajos de empleados' using errcode = '23514';
    end if;

    insert into public.profiles (
      id, first_name, last_name, contact_email, company_id, onboarding_completed_at
    )
    values (
      new_user_id, registration.first_name, registration.last_name, registration.email,
      p_company_id, coalesce(target_profile.onboarding_completed_at, now())
    );
    update public.requests set employee_id = new_user_id where employee_id = p_existing_profile_id;
    update public.requests set resolved_by = new_user_id where resolved_by = p_existing_profile_id;
    update public.request_comments set author_id = new_user_id where author_id = p_existing_profile_id;
    update public.request_history set actor_id = new_user_id where actor_id = p_existing_profile_id;
    update public.personal_data_change_requests
      set employee_id = new_user_id,
          reviewed_by = case when reviewed_by = p_existing_profile_id then new_user_id else reviewed_by end
      where employee_id = p_existing_profile_id or reviewed_by = p_existing_profile_id;
    update public.employee_documents
      set employee_id = new_user_id
      where employee_id = p_existing_profile_id;
    update public.employee_documents set created_by = new_user_id where created_by = p_existing_profile_id;
    update public.payroll_slips set employee_id = new_user_id where employee_id = p_existing_profile_id;
    update public.payroll_slips set uploaded_by = new_user_id where uploaded_by = p_existing_profile_id;
    update public.notifications set user_id = new_user_id where user_id = p_existing_profile_id;
    update public.audit_logs set actor_id = new_user_id where actor_id = p_existing_profile_id;
    delete from public.user_company_access where user_id = p_existing_profile_id;
    update app_private.user_roles set user_id = new_user_id where user_id = p_existing_profile_id;
    update public.employee_registration_requests
    set employee_profile_id = new_user_id
    where employee_profile_id = p_existing_profile_id;
    delete from public.profiles where id = p_existing_profile_id;
    update public.profiles
    set dni = target_profile.dni,
        employee_number = target_profile.employee_number,
        department = target_profile.department,
        position = target_profile.position,
        phone = target_profile.phone,
        address = target_profile.address,
        hire_date = target_profile.hire_date,
        employment_status = target_profile.employment_status,
        updated_at = now()
    where id = new_user_id;
  else
    insert into app_private.user_roles (user_id, role, created_by)
    values (new_user_id, 'EMPLEADO', auth.uid());
    insert into public.profiles (
      id, first_name, last_name, contact_email, dni, employee_number, company_id,
      department, position, hire_date, onboarding_completed_at
    )
    values (
      new_user_id, registration.first_name, registration.last_name, registration.email,
      registration.dni, trim(p_employee_number), p_company_id,
      nullif(trim(p_department), ''), nullif(trim(p_position), ''), p_hire_date, now()
    );
  end if;

  update public.employee_registration_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      employee_profile_id = new_user_id, company_id = p_company_id
  where id = p_registration_id returning * into registration;
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_company_id, 'registration.approved', 'employee_registration', p_registration_id,
    jsonb_build_object('employee_id', new_user_id));
  return registration;
end;
$$;

revoke all on function public.review_employee_registration(uuid, boolean, uuid, text, date, uuid, text, text)
  from public, anon;
grant execute on function public.review_employee_registration(uuid, boolean, uuid, text, date, uuid, text, text)
  to authenticated;

grant update (dni) on public.profiles to authenticated;
grant select on public.employee_registration_requests to service_role;

create policy hr_private_payroll_read on storage.objects for select to authenticated
  using (
    bucket_id = 'hr-private'
    and exists (
      select 1 from public.payroll_slips s
      where s.storage_path = storage.objects.name
        and s.pay_period >= (current_date - interval '1 year')::date
        and (s.employee_id = auth.uid() or app_private.can_manage_documents(s.company_id))
    )
  );

create policy hr_private_payroll_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hr-private'
    and exists (
      select 1 from public.payroll_slips s
      where s.storage_path = storage.objects.name
        and app_private.can_manage_documents(s.company_id)
    )
  );
