create or replace function public.list_managed_users()
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  role public.app_role
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null or app_private.current_role() is distinct from 'SUPERADMIN' then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  return query
  select p.id, p.first_name, p.last_name, u.email::text, r.role
  from app_private.user_roles r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  order by p.last_name, p.first_name;
end;
$$;

revoke all on function public.list_managed_users() from public, anon;
grant execute on function public.list_managed_users() to authenticated;
