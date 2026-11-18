create table public.job_vacancies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 120),
  description text check (description is null or length(trim(description)) <= 4000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create index job_vacancies_company_active_idx
  on public.job_vacancies (company_id, active, title);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  dni text not null check (dni ~ '^[0-9]{7,8}$'),
  phone text not null check (length(trim(phone)) between 6 and 40),
  company_id uuid not null references public.companies(id) on delete restrict,
  vacancy_id uuid,
  is_spontaneous boolean not null default false,
  cv_storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint job_applications_vacancy_company_fk
    foreign key (vacancy_id, company_id)
    references public.job_vacancies(id, company_id) on delete restrict,
  constraint job_applications_spontaneous_vacancy_check
    check ((is_spontaneous and vacancy_id is null) or (not is_spontaneous and vacancy_id is not null))
);

create index job_applications_created_idx on public.job_applications (created_at desc);
create index job_applications_company_created_idx on public.job_applications (company_id, created_at desc);
create index job_applications_vacancy_created_idx on public.job_applications (vacancy_id, created_at desc);
create index job_applications_dni_idx on public.job_applications (dni);

alter table public.job_vacancies enable row level security;
alter table public.job_applications enable row level security;

create policy job_vacancies_read_admin on public.job_vacancies for select to authenticated
  using (app_private.current_role() in ('RRHH_ADMIN', 'GERENTE', 'SUPERADMIN'));
create policy job_vacancies_insert_hr on public.job_vacancies for insert to authenticated
  with check (app_private.current_role() in ('RRHH_ADMIN', 'SUPERADMIN'));
create policy job_vacancies_update_hr on public.job_vacancies for update to authenticated
  using (app_private.current_role() in ('RRHH_ADMIN', 'SUPERADMIN'))
  with check (app_private.current_role() in ('RRHH_ADMIN', 'SUPERADMIN'));
create policy job_vacancies_delete_hr on public.job_vacancies for delete to authenticated
  using (app_private.current_role() in ('RRHH_ADMIN', 'SUPERADMIN'));

create policy job_applications_read_admin on public.job_applications for select to authenticated
  using (app_private.current_role() in ('RRHH_ADMIN', 'GERENTE', 'SUPERADMIN'));

revoke all on public.job_vacancies, public.job_applications from anon, authenticated;
grant select on public.job_vacancies, public.job_applications to authenticated;
grant insert (company_id, title, description, active) on public.job_vacancies to authenticated;
grant update (company_id, title, description, active, updated_at) on public.job_vacancies to authenticated;
grant delete on public.job_vacancies to authenticated;
grant all on public.job_vacancies, public.job_applications to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-applicant-cvs',
  'job-applicant-cvs',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
