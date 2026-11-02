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
