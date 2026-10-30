alter table public.profiles
  add column onboarding_completed_at timestamptz;

update public.profiles
set onboarding_completed_at = coalesce(updated_at, now())
where onboarding_completed_at is null;

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
      onboarding_completed_at = now(),
      updated_at = now()
  where id = auth.uid()
    and onboarding_completed_at is null;

  if not found then
    if exists (select 1 from public.profiles where id = auth.uid()) then
      raise exception 'El alta ya fue completada' using errcode = '42501';
    end if;
    raise exception 'No existe un perfil para esta cuenta' using errcode = '23503';
  end if;
end;
$$;
