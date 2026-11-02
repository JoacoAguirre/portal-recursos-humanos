create or replace function app_private.has_company_access(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private, public
as $$
  select coalesce(
    app_private.current_role() = 'SUPERADMIN'
    or (
      app_private.current_role() in ('RRHH_ADMIN', 'GERENTE')
      and exists (
        select 1 from public.user_company_access a
        where a.user_id = auth.uid() and a.company_id = target_company_id
      )
    ),
    false
  )
$$;

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
  join app_private.user_roles r on r.user_id = a.user_id
  where a.company_id = new.company_id
    and (a.can_resolve_requests or r.role = 'GERENTE');

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), new.company_id, 'request.created', 'request', new.id);
  return new;
end;
$$;

create or replace function app_private.record_personal_change_creation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), new.company_id, 'profile.change.requested', 'personal_data_change', new.id);
  insert into public.notifications (user_id, title, message, type, related_entity_id)
  select a.user_id, 'Actualización de datos solicitada',
    'Hay una solicitud de actualización de datos personales para revisar.',
    'request', new.id
  from public.user_company_access a
  join app_private.user_roles r on r.user_id = a.user_id
  where a.company_id = new.company_id
    and (a.can_resolve_requests or r.role = 'GERENTE');
  return new;
end;
$$;

create or replace function public.enqueue_document_expiry_notifications(
  p_time_zone text default 'America/Argentina/Buenos_Aires'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  inserted_count integer;
  business_date date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Solo el proceso programado puede ejecutarlo' using errcode = '42501';
  end if;
  if p_time_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'La zona horaria configurada no es válida' using errcode = '22023';
  end if;
  business_date := (now() at time zone p_time_zone)::date;

  insert into public.notifications (user_id, title, message, type, related_entity_id, dedupe_key)
  with recipients as (
    select d.id as document_id, d.expiration_date, p.id as user_id, d.expiration_date < business_date as expired
    from public.employee_documents d
    join public.profiles p on p.id = d.employee_id
    where d.active and d.expiration_date is not null
      and d.expiration_date <= business_date + 30
      and p.employment_status = 'active'
    union
    select d.id, d.expiration_date, a.user_id, d.expiration_date < business_date
    from public.employee_documents d
    join public.user_company_access a on a.company_id = d.company_id
    join app_private.user_roles r on r.user_id = a.user_id
    where d.active and d.expiration_date is not null
      and d.expiration_date <= business_date + 30
      and (a.can_manage_documents and r.role = 'RRHH_ADMIN' or r.role = 'GERENTE')
  )
  select r.user_id,
    case when r.expired then 'Documento vencido' else 'Documento próximo a vencer' end,
    case when r.expired
      then 'Un documento requiere revisión por vencimiento.'
      else 'Un documento vencerá dentro de los próximos 30 días.'
    end,
    'document',
    r.document_id,
    'document-expiry:' || r.document_id::text || ':' || r.expiration_date::text || ':' || r.user_id::text
  from recipients r
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.configure_user_company_access(
  p_user_id uuid,
  p_company_id uuid,
  p_enabled boolean,
  p_can_manage_employees boolean default false,
  p_can_manage_documents boolean default false,
  p_can_resolve_requests boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  target_role public.app_role;
begin
  if auth.uid() is null or app_private.current_role() is distinct from 'SUPERADMIN' then
    raise exception 'Solo SUPERADMIN puede configurar accesos administrativos' using errcode = '42501';
  end if;
  select role into target_role from app_private.user_roles where user_id = p_user_id;
  if target_role is null or target_role not in ('RRHH_ADMIN', 'GERENTE') then
    raise exception 'El usuario debe tener rol administrativo' using errcode = '42501';
  end if;
  if target_role = 'GERENTE' and (
    p_can_manage_employees or p_can_manage_documents or p_can_resolve_requests
  ) then
    raise exception 'El rol GERENTE es de solo lectura' using errcode = '42501';
  end if;
  if p_enabled then
    if not exists (select 1 from public.companies where id = p_company_id and active) then
      raise exception 'Empresa no disponible' using errcode = '23503';
    end if;
    insert into public.user_company_access (
      user_id, company_id, can_manage_employees, can_manage_documents, can_resolve_requests
    )
    values (
      p_user_id, p_company_id, p_can_manage_employees, p_can_manage_documents, p_can_resolve_requests
    )
    on conflict (user_id, company_id) do update set
      can_manage_employees = excluded.can_manage_employees,
      can_manage_documents = excluded.can_manage_documents,
      can_resolve_requests = excluded.can_resolve_requests;
  else
    delete from public.user_company_access where user_id = p_user_id and company_id = p_company_id;
  end if;
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_company_id, 'admin.company_access.changed', 'user', p_user_id,
    jsonb_build_object('enabled', p_enabled, 'can_manage_employees', p_can_manage_employees,
      'can_manage_documents', p_can_manage_documents, 'can_resolve_requests', p_can_resolve_requests));
end;
$$;

create or replace function public.configure_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  current_target_role public.app_role;
begin
  if auth.uid() is null or app_private.current_role() is distinct from 'SUPERADMIN' then
    raise exception 'Solo SUPERADMIN puede modificar roles' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No se puede modificar el propio rol' using errcode = '42501';
  end if;
  select role into current_target_role from app_private.user_roles where user_id = p_user_id for update;
  if current_target_role is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Usuario no disponible' using errcode = '23503';
  end if;
  if current_target_role = 'SUPERADMIN' and p_role <> 'SUPERADMIN'
     and (select count(*) from app_private.user_roles where role = 'SUPERADMIN') <= 1 then
    raise exception 'No se puede quitar el último SUPERADMIN' using errcode = '23514';
  end if;
  if p_role = 'EMPLEADO' and not exists (
    select 1 from public.profiles where id = p_user_id and company_id is not null
  ) then
    raise exception 'El empleado debe estar asignado a una empresa' using errcode = '23514';
  end if;

  update app_private.user_roles set role = p_role where user_id = p_user_id;
  if p_role not in ('RRHH_ADMIN', 'GERENTE') then
    delete from public.user_company_access where user_id = p_user_id;
  elsif p_role = 'GERENTE' then
    update public.user_company_access
    set can_manage_employees = false, can_manage_documents = false, can_resolve_requests = false
    where user_id = p_user_id;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'user.role.changed', 'user', p_user_id,
    jsonb_build_object('previous_role', current_target_role, 'new_role', p_role));
end;
$$;

drop policy if exists epp_catalog_admin_manage on public.epp_catalog;
create policy epp_catalog_admin_manage on public.epp_catalog for all to authenticated
  using (
    company_id is null and app_private.current_role() = 'SUPERADMIN'
    or company_id is not null
      and app_private.current_role() in ('RRHH_ADMIN', 'SUPERADMIN')
      and app_private.has_company_access(company_id)
  )
  with check (
    company_id is null and app_private.current_role() = 'SUPERADMIN'
    or company_id is not null
      and app_private.current_role() in ('RRHH_ADMIN', 'SUPERADMIN')
      and app_private.has_company_access(company_id)
  );

drop policy if exists employee_documents_read on public.employee_documents;
create policy employee_documents_read on public.employee_documents for select to authenticated
  using (
    (active and app_private.can_view_employee(employee_id, company_id))
    or app_private.can_manage_documents(company_id)
    or app_private.current_role() = 'GERENTE' and app_private.has_company_access(company_id)
  );

drop policy if exists payroll_slips_read on public.payroll_slips;
create policy payroll_slips_read on public.payroll_slips for select to authenticated
  using (
    pay_period >= (current_date - interval '1 year')::date
    and (
      employee_id = auth.uid()
      or app_private.can_manage_documents(company_id)
      or app_private.current_role() = 'GERENTE' and app_private.has_company_access(company_id)
    )
  );

drop policy if exists hr_private_payroll_read on storage.objects;
create policy hr_private_payroll_read on storage.objects for select to authenticated
  using (
    bucket_id = 'hr-private'
    and exists (
      select 1 from public.payroll_slips s
      where s.storage_path = storage.objects.name
        and s.pay_period >= (current_date - interval '1 year')::date
        and (
          s.employee_id = auth.uid()
          or app_private.can_manage_documents(s.company_id)
          or app_private.current_role() = 'GERENTE' and app_private.has_company_access(s.company_id)
        )
    )
  );

drop policy if exists notifications_mark_read_own on public.notifications;
create policy notifications_mark_read_own on public.notifications for update to authenticated
  using (user_id = auth.uid() and app_private.current_role() <> 'GERENTE')
  with check (user_id = auth.uid() and app_private.current_role() <> 'GERENTE');
