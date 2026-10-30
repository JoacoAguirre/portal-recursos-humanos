-- Ejecute manualmente con una cuenta operadora autorizada después de crear el
-- usuario desde Supabase Auth. Reemplace el UUID; no acepte este valor desde
-- una llamada de usuario final o un endpoint público.
do $$
declare
  bootstrap_user_id uuid := 'c214d606-9967-4f22-a9c6-915e937fc701';
begin
  if bootstrap_user_id is null or not exists (
    select 1 from auth.users where id = bootstrap_user_id
  ) then
    raise exception 'Reemplace NULL por el UUID existente del usuario de Auth';
  end if;

  insert into app_private.user_roles (user_id, role)
  values (bootstrap_user_id, 'SUPERADMIN')
  on conflict (user_id) do update set role = 'SUPERADMIN';

  insert into public.profiles (id, first_name, last_name, contact_email, company_id)
  select bootstrap_user_id, coalesce(raw_user_meta_data->>'first_name', 'Administrador'),
    coalesce(raw_user_meta_data->>'last_name', 'Sistema'), email, null
  from auth.users
  where id = bootstrap_user_id
  on conflict (id) do nothing;
end
$$;
