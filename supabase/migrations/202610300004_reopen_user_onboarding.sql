create or replace function public.reopen_user_onboarding(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  target_company_id uuid;
begin
  if auth.uid() is null or auth.uid() = p_user_id
     or app_private.current_role() is distinct from 'SUPERADMIN' then
    raise exception 'Solo SUPERADMIN puede reabrir el alta de otro usuario' using errcode = '42501';
  end if;

  update public.profiles
  set onboarding_completed_at = null,
      updated_at = now()
  where id = p_user_id
    and exists (
      select 1 from app_private.user_roles
      where user_id = p_user_id and role in ('EMPLEADO', 'RRHH_ADMIN')
    )
  returning company_id into target_company_id;

  if not found then
    raise exception 'Usuario no disponible para reabrir el alta' using errcode = '23503';
  end if;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), target_company_id, 'user.onboarding.reopened', 'user', p_user_id, '{}'::jsonb);
end;
$$;

revoke all on function public.reopen_user_onboarding(uuid) from public, anon;
grant execute on function public.reopen_user_onboarding(uuid) to authenticated;
