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
  target_role text;
begin
  if auth.uid() is null or app_private.current_role()::text is distinct from 'SUPERADMIN' then
    raise exception 'Solo SUPERADMIN puede configurar accesos administrativos' using errcode = '42501';
  end if;
  if p_user_id is null or p_company_id is null or p_enabled is null
     or p_can_manage_employees is null or p_can_manage_documents is null
     or p_can_resolve_requests is null then
    raise exception 'La configuración de acceso está incompleta' using errcode = '22023';
  end if;

  select role::text into target_role
  from app_private.user_roles
  where user_id = p_user_id;

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

    delete from public.user_company_access
    where user_id = p_user_id and company_id <> p_company_id;

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
    delete from public.user_company_access where user_id = p_user_id;
  end if;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_company_id, 'admin.company_access.changed', 'user', p_user_id,
    jsonb_build_object('enabled', p_enabled, 'can_manage_employees', p_can_manage_employees,
      'can_manage_documents', p_can_manage_documents, 'can_resolve_requests', p_can_resolve_requests));
end;
$$;

revoke all on function public.configure_user_company_access(uuid, uuid, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.configure_user_company_access(uuid, uuid, boolean, boolean, boolean, boolean)
  to authenticated;
