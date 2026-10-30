insert into public.companies (code, name) values
  ('IVVT', 'IVVT'),
  ('IVVC', 'IVVC'),
  ('IVPE', 'IVPE'),
  ('ASP', 'ASP'),
  ('ARGSOL', 'ARGSOL'),
  ('FYE', 'Frenos y Equipos')
on conflict (code) do update set name = excluded.name, updated_at = now();

insert into public.epp_catalog (company_id, name, description)
select null, item.name, item.description
from (values
  ('Ropa de trabajo', 'Indumentaria de trabajo'),
  ('Calzado de seguridad', 'Calzado de protección'),
  ('Guantes', 'Protección de manos'),
  ('Casco', 'Protección de cabeza'),
  ('Protección ocular', 'Protección de ojos')
) as item(name, description)
on conflict do nothing;
