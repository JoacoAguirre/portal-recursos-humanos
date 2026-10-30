create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.is_valid_iso_date(value text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  return to_char(to_date(value, 'YYYY-MM-DD'), 'YYYY-MM-DD') = value;
exception
  when others then return false;
end;
$$;

create or replace function app_private.is_valid_request_payload(kind text, value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  start_date text;
  end_date text;
  days integer;
begin
  if value is null or jsonb_typeof(value) <> 'object' then
    return false;
  end if;

  if kind = 'leave' then
    if value - array['leave_type', 'start_date', 'end_date', 'reason', 'observations'] <> '{}'::jsonb
       or jsonb_typeof(value->'leave_type') <> 'string'
       or length(trim(value->>'leave_type')) not between 1 and 100
       or jsonb_typeof(value->'start_date') <> 'string'
       or not app_private.is_valid_iso_date(value->>'start_date')
       or jsonb_typeof(value->'reason') <> 'string'
       or length(trim(value->>'reason')) not between 1 and 2000
       or (value ? 'end_date' and jsonb_typeof(value->'end_date') <> 'string')
       or (value ? 'observations' and jsonb_typeof(value->'observations') <> 'string')
       or length(coalesce(value->>'observations', '')) > 2000 then
      return false;
    end if;
    start_date := value->>'start_date';
    end_date := value->>'end_date';
    return end_date is null or end_date = ''
      or app_private.is_valid_iso_date(end_date) and end_date >= start_date;
  elsif kind = 'vacation' then
    if value - array['start_date', 'end_date', 'calendar_days', 'observations'] <> '{}'::jsonb
       or not app_private.is_valid_iso_date(value->>'start_date')
       or not app_private.is_valid_iso_date(value->>'end_date')
       or jsonb_typeof(value->'calendar_days') <> 'number'
       or value->>'calendar_days' !~ '^[0-9]{1,3}$'
       or (value ? 'observations' and jsonb_typeof(value->'observations') <> 'string')
       or length(coalesce(value->>'observations', '')) > 2000 then
      return false;
    end if;
    start_date := value->>'start_date';
    end_date := value->>'end_date';
    days := (value->>'calendar_days')::integer;
    return end_date >= start_date
      and days between 1 and 366
      and days = to_date(end_date, 'YYYY-MM-DD') - to_date(start_date, 'YYYY-MM-DD') + 1;
  elsif kind = 'epp' then
    return value - array['item_name', 'quantity', 'reason', 'observations'] = '{}'::jsonb
      and jsonb_typeof(value->'item_name') = 'string'
      and length(trim(value->>'item_name')) between 1 and 120
      and jsonb_typeof(value->'reason') = 'string'
      and length(trim(value->>'reason')) between 1 and 2000
      and jsonb_typeof(value->'quantity') = 'number'
      and value->>'quantity' ~ '^[0-9]{1,4}$'
      and (value->>'quantity')::integer between 1 and 1000
      and (not (value ? 'observations') or jsonb_typeof(value->'observations') = 'string')
      and length(coalesce(value->>'observations', '')) <= 2000;
  elsif kind = 'personal_data' then
    return value - array['phone', 'contact_email', 'address'] = '{}'::jsonb
      and (jsonb_typeof(value->'phone') is null or jsonb_typeof(value->'phone') = 'string')
      and (jsonb_typeof(value->'contact_email') is null or jsonb_typeof(value->'contact_email') = 'string')
      and (jsonb_typeof(value->'address') is null or jsonb_typeof(value->'address') = 'string')
      and length(coalesce(value->>'phone', '')) <= 40
      and length(coalesce(value->>'contact_email', '')) <= 254
      and (coalesce(value->>'contact_email', '') = '' or value->>'contact_email' ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
      and length(coalesce(value->>'address', '')) <= 300
      and (
        length(trim(coalesce(value->>'phone', ''))) > 0
        or length(trim(coalesce(value->>'contact_email', ''))) > 0
        or length(trim(coalesce(value->>'address', ''))) > 0
      );
  elsif kind = 'other' then
    return value - array['subject', 'details'] = '{}'::jsonb
      and jsonb_typeof(value->'subject') = 'string'
      and length(trim(value->>'subject')) between 1 and 160
      and jsonb_typeof(value->'details') = 'string'
      and length(trim(value->>'details')) between 1 and 4000;
  end if;
  return false;
end;
$$;

create type public.app_role as enum ('EMPLEADO', 'RRHH_ADMIN', 'SUPERADMIN');
create type public.employment_status as enum ('active', 'inactive', 'leave');
create type public.request_status as enum ('pending', 'in_review', 'observed', 'approved', 'rejected', 'cancelled');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.companies (code, name) values
  ('IVVT', 'IVVT'),
  ('IVVC', 'IVVC'),
  ('IVPE', 'IVPE'),
  ('ASP', 'ASP'),
  ('ARGSOL', 'ARGSOL'),
  ('FYE', 'Frenos y Equipos')
on conflict (code) do update set name = excluded.name, updated_at = now();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  contact_email text,
  employee_number text,
  company_id uuid references public.companies(id) on delete restrict,
  department text,
  position text,
  phone text,
  address text,
  hire_date date,
  employment_status public.employment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_employee_number_nonempty check (employee_number is null or length(trim(employee_number)) > 0),
  constraint profiles_contact_email_format check (contact_email is null or contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);

create unique index profiles_employee_number_unique
  on public.profiles (lower(employee_number)) where employee_number is not null;
create index profiles_company_status_idx on public.profiles (company_id, employment_status);

create table app_private.user_roles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
revoke all on app_private.user_roles from public, anon, authenticated;

create table public.user_company_access (
  user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  can_manage_employees boolean not null default false,
  can_manage_documents boolean not null default false,
  can_resolve_requests boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index user_company_access_company_idx on public.user_company_access (company_id, user_id);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  request_type text not null check (request_type in ('leave', 'vacation', 'epp', 'other')),
  status public.request_status not null default 'pending',
  payload jsonb not null check (app_private.is_valid_request_payload(request_type, payload)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  constraint requests_resolution_consistent check (
    (status in ('approved', 'rejected', 'cancelled') and resolved_at is not null)
    or (status not in ('approved', 'rejected', 'cancelled') and resolved_at is null)
  )
);
create index requests_company_status_created_idx on public.requests (company_id, status, created_at desc);
create index requests_employee_created_idx on public.requests (employee_id, created_at desc);

create table public.request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 4000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index request_comments_request_created_idx on public.request_comments (request_id, created_at);

create table public.request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_status public.request_status,
  new_status public.request_status not null,
  action text not null check (action in ('created', 'reviewed', 'observed', 'approved', 'rejected', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index request_history_request_created_idx on public.request_history (request_id, created_at);

create table public.personal_data_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  requested_data jsonb not null check (
    app_private.is_valid_request_payload('personal_data', requested_data)
  ),
  status public.request_status not null default 'pending'
    check (status in ('pending', 'in_review', 'observed', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_comment text check (review_comment is null or length(review_comment) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint personal_changes_resolution_consistent check (
    (status in ('approved', 'rejected', 'cancelled') and reviewed_at is not null)
    or (status not in ('approved', 'rejected', 'cancelled') and reviewed_at is null)
  )
);
create index personal_data_changes_employee_created_idx on public.personal_data_change_requests (employee_id, created_at desc);
create index personal_data_changes_company_status_idx on public.personal_data_change_requests (company_id, status);

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  document_type text not null check (length(trim(document_type)) between 1 and 120),
  storage_path text not null unique check (storage_path !~ '(^/|[.][.]|//)'),
  issue_date date,
  expiration_date date,
  expiration_unknown boolean not null default false,
  notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_expiration_not_unknown_and_set check (not (expiration_unknown and expiration_date is not null)),
  constraint documents_expiration_after_issue check (issue_date is null or expiration_date is null or expiration_date >= issue_date)
);
create index employee_documents_company_expiration_idx on public.employee_documents (company_id, expiration_date) where active;
create index employee_documents_employee_idx on public.employee_documents (employee_id, active);

create table public.epp_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (company_id, name)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) between 1 and 1000),
  type text not null check (type in ('request', 'document', 'system')),
  read_at timestamptz,
  related_entity_id uuid,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete restrict,
  action text not null check (length(action) between 1 and 120),
  entity_type text not null check (length(entity_type) between 1 and 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc);

create or replace function app_private.record_personal_change_creation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), new.company_id, 'profile.change.requested', 'personal_data_change', new.id);
  insert into public.notifications (user_id, title, message, type, related_entity_id)
  select a.user_id, 'Actualización de datos solicitada',
    'Hay una solicitud de actualización de datos personales para revisar.',
    'request', new.id
  from public.user_company_access a
  where a.company_id = new.company_id and a.can_resolve_requests;
  return new;
end;
$$;

create trigger personal_data_change_record_creation
after insert on public.personal_data_change_requests
for each row execute function app_private.record_personal_change_creation();

create or replace function app_private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, app_private
as $$
  select role from app_private.user_roles where user_id = auth.uid()
$$;

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
      app_private.current_role() = 'RRHH_ADMIN'
      and exists (
        select 1 from public.user_company_access a
        where a.user_id = auth.uid() and a.company_id = target_company_id
      )
    ),
    false
  )
$$;

create or replace function app_private.can_manage_employees(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private, public
as $$
  select coalesce(
    app_private.current_role() = 'SUPERADMIN'
    or (
      app_private.current_role() = 'RRHH_ADMIN'
      and exists (
        select 1 from public.user_company_access a
        where a.user_id = auth.uid()
          and a.company_id = target_company_id
          and a.can_manage_employees
      )
    ),
    false
  )
$$;

create or replace function app_private.can_manage_documents(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private, public
as $$
  select coalesce(
    app_private.current_role() = 'SUPERADMIN'
    or (
      app_private.current_role() = 'RRHH_ADMIN'
      and exists (
        select 1 from public.user_company_access a
        where a.user_id = auth.uid()
          and a.company_id = target_company_id
          and a.can_manage_documents
      )
    ),
    false
  )
$$;

create or replace function app_private.can_resolve_requests(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private, public
as $$
  select coalesce(
    app_private.current_role() = 'SUPERADMIN'
    or (
      app_private.current_role() = 'RRHH_ADMIN'
      and exists (
        select 1 from public.user_company_access a
        where a.user_id = auth.uid()
          and a.company_id = target_company_id
          and a.can_resolve_requests
      )
    ),
    false
  )
$$;

create or replace function app_private.can_view_employee(target_employee_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private, public
as $$
  select coalesce(
    (auth.uid() = target_employee_id and exists (
      select 1 from public.profiles p
      where p.id = target_employee_id
        and p.company_id = target_company_id
        and p.employment_status in ('active', 'leave')
    ))
    or app_private.has_company_access(target_company_id),
    false
  )
$$;

create or replace function app_private.is_active_employee(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private, public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = target_company_id
    and p.employment_status in ('active', 'leave')
      and app_private.current_role() = 'EMPLEADO'
  )
$$;

create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, app_private
as $$
  select app_private.current_role()
$$;

revoke all on function app_private.current_role() from public, anon;
revoke all on function app_private.is_valid_iso_date(text) from public, anon;
revoke all on function app_private.is_valid_request_payload(text, jsonb) from public, anon;
revoke all on function app_private.has_company_access(uuid) from public, anon;
revoke all on function app_private.can_manage_employees(uuid) from public, anon;
revoke all on function app_private.can_manage_documents(uuid) from public, anon;
revoke all on function app_private.can_resolve_requests(uuid) from public, anon;
revoke all on function app_private.can_view_employee(uuid, uuid) from public, anon;
revoke all on function app_private.is_active_employee(uuid) from public, anon;
revoke all on function app_private.record_personal_change_creation() from public, anon, authenticated;
revoke all on function public.get_my_role() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.current_role() to authenticated;
grant execute on function app_private.is_valid_iso_date(text) to authenticated;
grant execute on function app_private.is_valid_request_payload(text, jsonb) to authenticated;
grant execute on function app_private.has_company_access(uuid) to authenticated;
grant execute on function app_private.can_manage_employees(uuid) to authenticated;
grant execute on function app_private.can_manage_documents(uuid) to authenticated;
grant execute on function app_private.can_resolve_requests(uuid) to authenticated;
grant execute on function app_private.can_view_employee(uuid, uuid) to authenticated;
grant execute on function app_private.is_active_employee(uuid) to authenticated;
grant execute on function public.get_my_role() to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_company_access enable row level security;
alter table public.requests enable row level security;
alter table public.request_comments enable row level security;
alter table public.request_history enable row level security;
alter table public.personal_data_change_requests enable row level security;
alter table public.employee_documents enable row level security;
alter table public.epp_catalog enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy companies_read on public.companies for select to authenticated
  using (active and (
    app_private.has_company_access(id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.company_id = id and p.employment_status in ('active', 'leave'))
  ));
create policy companies_superadmin_manage on public.companies for all to authenticated
  using (app_private.current_role() = 'SUPERADMIN')
  with check (app_private.current_role() = 'SUPERADMIN');

create policy profiles_read on public.profiles for select to authenticated
  using (app_private.can_view_employee(id, company_id));
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (app_private.can_manage_employees(company_id));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (app_private.can_manage_employees(company_id))
  with check (app_private.can_manage_employees(company_id));

create policy user_company_access_read on public.user_company_access for select to authenticated
  using (app_private.current_role() = 'SUPERADMIN' or app_private.has_company_access(company_id));
create policy user_company_access_superadmin_manage on public.user_company_access for all to authenticated
  using (app_private.current_role() = 'SUPERADMIN')
  with check (app_private.current_role() = 'SUPERADMIN');

create policy requests_read on public.requests for select to authenticated
  using (app_private.can_view_employee(employee_id, company_id));
create policy requests_create_self on public.requests for insert to authenticated
  with check (
    employee_id = auth.uid()
    and app_private.is_active_employee(company_id)
    and status = 'pending'
    and resolved_at is null
    and resolved_by is null
    and version = 1
  );

create policy request_comments_read on public.request_comments for select to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_id
        and app_private.can_view_employee(r.employee_id, r.company_id)
        and (not internal or app_private.has_company_access(r.company_id))
    )
  );
create policy request_comments_employee_insert on public.request_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and not internal
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.employee_id = auth.uid() and r.status in ('pending', 'in_review', 'observed')
    )
  );

create policy request_history_read on public.request_history for select to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_id and app_private.can_view_employee(r.employee_id, r.company_id)
    )
  );

create policy personal_changes_read on public.personal_data_change_requests for select to authenticated
  using (employee_id = auth.uid() or app_private.has_company_access(company_id));
create policy personal_changes_create_self on public.personal_data_change_requests for insert to authenticated
  with check (
    employee_id = auth.uid()
    and app_private.is_active_employee(company_id)
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_comment is null
  );

create policy employee_documents_read on public.employee_documents for select to authenticated
  using ((active and app_private.can_view_employee(employee_id, company_id))
    or app_private.can_manage_documents(company_id));
create policy employee_documents_admin_create on public.employee_documents for insert to authenticated
  with check (app_private.can_manage_documents(company_id) and created_by = auth.uid());
create policy employee_documents_admin_update on public.employee_documents for update to authenticated
  using (app_private.can_manage_documents(company_id))
  with check (app_private.can_manage_documents(company_id));

create policy epp_catalog_read on public.epp_catalog for select to authenticated
  using (
    active and (company_id is null or app_private.has_company_access(company_id)
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.company_id = epp_catalog.company_id))
  );
create policy epp_catalog_admin_manage on public.epp_catalog for all to authenticated
  using (company_id is null and app_private.current_role() = 'SUPERADMIN'
    or company_id is not null and app_private.has_company_access(company_id))
  with check (company_id is null and app_private.current_role() = 'SUPERADMIN'
    or company_id is not null and app_private.has_company_access(company_id));

create policy notifications_read_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_logs_admin_read on public.audit_logs for select to authenticated
  using (app_private.current_role() = 'SUPERADMIN' or app_private.has_company_access(company_id));

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
  select a.user_id, 'Nueva solicitud', 'Hay una nueva solicitud pendiente de revisión.',
    'request', new.id
  from public.user_company_access a
  where a.company_id = new.company_id
    and a.can_resolve_requests;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), new.company_id, 'request.created', 'request', new.id);
  return new;
end;
$$;

create trigger requests_record_creation
after insert on public.requests
for each row execute function app_private.record_request_creation();

create or replace function app_private.record_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if row(old.first_name, old.last_name, old.employee_number, old.company_id, old.department,
      old.position, old.phone, old.address, old.hire_date, old.employment_status)
     is distinct from
     row(new.first_name, new.last_name, new.employee_number, new.company_id, new.department,
      new.position, new.phone, new.address, new.hire_date, new.employment_status) then
    insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), new.company_id, 'profile.updated', 'profile', new.id,
      jsonb_build_object('changed', array_remove(array[
        case when old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name then 'name' end,
        case when old.employee_number is distinct from new.employee_number then 'employee_number' end,
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

create trigger profiles_record_update
after update on public.profiles
for each row execute function app_private.record_profile_update();

create or replace function app_private.record_document_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    coalesce(new.company_id, old.company_id),
    case when tg_op = 'INSERT' then 'document.created'
      when new.active is distinct from old.active and not new.active then 'document.deactivated'
      else 'document.updated' end,
    'employee_document',
    coalesce(new.id, old.id),
    jsonb_build_object('document_type', coalesce(new.document_type, old.document_type))
  );
  return new;
end;
$$;

create trigger employee_documents_record_audit
after insert or update on public.employee_documents
for each row execute function app_private.record_document_audit();

create or replace function app_private.record_company_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'company.updated', 'company', new.id,
    jsonb_build_object('changed_name', old.name is distinct from new.name,
      'changed_active', old.active is distinct from new.active));
  return new;
end;
$$;

create trigger companies_record_update
after update on public.companies
for each row execute function app_private.record_company_update();

create or replace function app_private.record_epp_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    new.company_id,
    case when tg_op = 'INSERT' then 'epp.created' else 'epp.updated' end,
    'epp_catalog',
    new.id,
    jsonb_build_object('active', new.active)
  );
  return new;
end;
$$;

create trigger epp_catalog_record_change
after insert or update on public.epp_catalog
for each row execute function app_private.record_epp_catalog_change();

revoke all on function app_private.record_request_creation() from public, anon, authenticated;
revoke all on function app_private.record_profile_update() from public, anon, authenticated;
revoke all on function app_private.record_document_audit() from public, anon, authenticated;
revoke all on function app_private.record_company_update() from public, anon, authenticated;
revoke all on function app_private.record_epp_catalog_change() from public, anon, authenticated;

revoke all on public.companies, public.profiles, public.user_company_access,
  public.requests, public.request_comments, public.request_history,
  public.personal_data_change_requests, public.employee_documents,
  public.epp_catalog, public.notifications, public.audit_logs
from anon, authenticated;
grant select on public.companies, public.profiles, public.user_company_access,
  public.requests, public.request_comments, public.request_history,
  public.personal_data_change_requests, public.employee_documents,
  public.epp_catalog, public.notifications, public.audit_logs to authenticated;
grant insert (employee_id, company_id, request_type, payload) on public.requests to authenticated;
grant insert (request_id, author_id, body, internal) on public.request_comments to authenticated;
grant insert (employee_id, company_id, requested_data) on public.personal_data_change_requests to authenticated;
grant insert (employee_id, company_id, document_type, storage_path, issue_date, expiration_date,
  expiration_unknown, notes, active, created_by) on public.employee_documents to authenticated;
grant update (first_name, last_name, contact_email, employee_number, company_id, department,
  position, phone, address, hire_date, employment_status, updated_at) on public.profiles to authenticated;
grant update (name, active, updated_at) on public.companies to authenticated;
grant update (document_type, issue_date, expiration_date, expiration_unknown, notes, active, updated_at)
  on public.employee_documents to authenticated;
grant insert (company_id, name, description) on public.epp_catalog to authenticated;
grant update (name, description, active) on public.epp_catalog to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.resolve_request(
  p_request_id uuid,
  p_expected_version integer,
  p_new_status public.request_status,
  p_comment text default null,
  p_internal_note text default null
)
returns public.requests
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  current_request public.requests%rowtype;
  previous_status public.request_status;
begin
  if auth.uid() is null or not (
    p_new_status in ('in_review', 'observed', 'approved', 'rejected')
  ) then
    raise exception 'Acceso denegado o estado inválido' using errcode = '42501';
  end if;

  select * into current_request
  from public.requests
  where id = p_request_id
  for update;

  if not found or not app_private.can_resolve_requests(current_request.company_id) then
    raise exception 'Solicitud no disponible' using errcode = '42501';
  end if;
  if current_request.version <> p_expected_version then
    raise exception 'La solicitud fue modificada por otro usuario; actualice la vista' using errcode = '40001';
  end if;
  if current_request.status not in ('pending', 'in_review', 'observed') then
    raise exception 'La solicitud ya fue resuelta' using errcode = '23514';
  end if;
  previous_status := current_request.status;
  if p_new_status = 'rejected' and coalesce(length(trim(p_comment)), 0) = 0 then
    raise exception 'El motivo del rechazo es obligatorio' using errcode = '23514';
  end if;
  if p_new_status = 'observed' and coalesce(length(trim(p_comment)), 0) = 0 then
    raise exception 'El comentario de observación es obligatorio' using errcode = '23514';
  end if;
  if p_comment is not null and length(trim(p_comment)) > 4000 then
    raise exception 'El comentario excede el máximo permitido' using errcode = '23514';
  end if;
  if p_internal_note is not null and (
    length(trim(p_internal_note)) = 0 or length(p_internal_note) > 4000
  ) then
    raise exception 'La nota interna no es válida' using errcode = '23514';
  end if;

  update public.requests
  set status = p_new_status,
      resolved_at = case when p_new_status in ('approved', 'rejected') then now() else null end,
      resolved_by = case when p_new_status in ('approved', 'rejected') then auth.uid() else null end,
      updated_at = now(),
      version = version + 1
  where id = p_request_id
  returning * into current_request;

  insert into public.request_history (request_id, actor_id, previous_status, new_status, action)
  values (
    p_request_id,
    auth.uid(),
    previous_status,
    p_new_status,
    case p_new_status
      when 'in_review' then 'reviewed'
      when 'observed' then 'observed'
      when 'approved' then 'approved'
      else 'rejected'
    end
  );

  if p_comment is not null then
    insert into public.request_comments (request_id, author_id, body, internal)
    values (p_request_id, auth.uid(), trim(p_comment), false);
  end if;
  if p_internal_note is not null then
    insert into public.request_comments (request_id, author_id, body, internal)
    values (p_request_id, auth.uid(), trim(p_internal_note), true);
  end if;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), current_request.company_id, 'request.' || p_new_status::text,
    'request', p_request_id, jsonb_build_object('version', current_request.version));

  insert into public.notifications (user_id, title, message, type, related_entity_id)
  values (
    current_request.employee_id,
    'Actualización de solicitud',
    'Tu solicitud tuvo una actualización de estado.',
    'request',
    p_request_id
  );

  return current_request;
end;
$$;

create or replace function public.cancel_own_request(p_request_id uuid, p_expected_version integer)
returns public.requests
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  current_request public.requests%rowtype;
  previous public.request_status;
begin
  if auth.uid() is null then
    raise exception 'Autenticación requerida' using errcode = '42501';
  end if;
  select * into current_request from public.requests where id = p_request_id for update;
  if not found or current_request.employee_id <> auth.uid() then
    raise exception 'Solicitud no disponible' using errcode = '42501';
  end if;
  if current_request.status <> 'pending' or current_request.version <> p_expected_version then
    raise exception 'La solicitud ya cambió y no se puede cancelar' using errcode = '40001';
  end if;
  previous := current_request.status;

  update public.requests
  set status = 'cancelled', resolved_at = now(), updated_at = now(), version = version + 1
  where id = p_request_id returning * into current_request;
  insert into public.request_history (request_id, actor_id, previous_status, new_status, action)
  values (p_request_id, auth.uid(), previous, 'cancelled', 'cancelled');
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), current_request.company_id, 'request.cancelled', 'request', p_request_id);
  return current_request;
end;
$$;

create or replace function public.review_personal_data_change(
  p_change_id uuid,
  p_approve boolean,
  p_comment text default null
)
returns public.personal_data_change_requests
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  change public.personal_data_change_requests%rowtype;
begin
  select * into change from public.personal_data_change_requests where id = p_change_id for update;
  if not found or not app_private.can_resolve_requests(change.company_id) then
    raise exception 'Solicitud no disponible' using errcode = '42501';
  end if;
  if change.status not in ('pending', 'in_review', 'observed') then
    raise exception 'La solicitud ya fue resuelta' using errcode = '23514';
  end if;

  if p_approve then
    update public.profiles
    set phone = case when change.requested_data ? 'phone' then change.requested_data->>'phone' else phone end,
        contact_email = case when change.requested_data ? 'contact_email' then change.requested_data->>'contact_email' else contact_email end,
        address = case when change.requested_data ? 'address' then change.requested_data->>'address' else address end,
        updated_at = now()
    where id = change.employee_id;
  elsif coalesce(length(trim(p_comment)), 0) = 0 then
    raise exception 'El motivo del rechazo es obligatorio' using errcode = '23514';
  end if;
  if p_comment is not null and length(trim(p_comment)) > 4000 then
    raise exception 'El comentario excede el máximo permitido' using errcode = '23514';
  end if;

  update public.personal_data_change_requests
  set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_comment = nullif(trim(p_comment), '')
  where id = p_change_id returning * into change;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id)
  values (auth.uid(), change.company_id,
    case when p_approve then 'profile.change.approved' else 'profile.change.rejected' end,
    'personal_data_change', p_change_id);
  if p_comment is not null and length(trim(p_comment)) > 0 then
    insert into public.notifications (user_id, title, message, type, related_entity_id)
    values (change.employee_id, 'Actualización de datos personales',
      'Tu solicitud de cambio de datos fue revisada.', 'request', p_change_id);
  end if;
  return change;
end;
$$;

create or replace function public.enqueue_document_expiry_notifications(p_time_zone text default 'America/Argentina/Buenos_Aires')
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
    join public.user_company_access a on a.company_id = d.company_id and a.can_manage_documents
    join app_private.user_roles r on r.user_id = a.user_id and r.role = 'RRHH_ADMIN'
    where d.active and d.expiration_date is not null and d.expiration_date <= business_date + 30
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

revoke all on function public.resolve_request(uuid, integer, public.request_status, text, text) from public, anon;
revoke all on function public.cancel_own_request(uuid, integer) from public, anon;
revoke all on function public.review_personal_data_change(uuid, boolean, text) from public, anon;
revoke all on function public.enqueue_document_expiry_notifications(text) from public, anon, authenticated;
grant execute on function public.resolve_request(uuid, integer, public.request_status, text, text) to authenticated;
grant execute on function public.cancel_own_request(uuid, integer) to authenticated;
grant execute on function public.review_personal_data_change(uuid, boolean, text) to authenticated;
grant execute on function public.enqueue_document_expiry_notifications(text) to service_role;

create or replace function public.create_employee_profile(
  p_user_id uuid,
  p_company_id uuid,
  p_first_name text,
  p_last_name text,
  p_employee_number text,
  p_department text default null,
  p_position text default null,
  p_phone text default null,
  p_address text default null,
  p_hire_date date default null
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
     or p_employee_number is null or length(trim(p_employee_number)) not between 1 and 60 then
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
    department, position, phone, address, hire_date
  )
  values (
    p_user_id, trim(p_first_name), trim(p_last_name), auth_email, trim(p_employee_number), p_company_id,
    nullif(trim(p_department), ''), nullif(trim(p_position), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_address), ''), p_hire_date
  )
  returning * into new_profile;

  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_company_id, 'employee.created', 'profile', p_user_id,
    jsonb_build_object('employee_number', new_profile.employee_number));
  return new_profile;
end;
$$;

create or replace function public.provision_hr_admin(
  p_user_id uuid,
  p_company_id uuid,
  p_first_name text,
  p_last_name text,
  p_can_manage_employees boolean default false,
  p_can_manage_documents boolean default false,
  p_can_resolve_requests boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  auth_email text;
  new_profile public.profiles%rowtype;
begin
  if auth.uid() is null or app_private.current_role() is distinct from 'SUPERADMIN' then
    raise exception 'Solo SUPERADMIN puede crear administradores' using errcode = '42501';
  end if;
  if p_first_name is null or length(trim(p_first_name)) not between 1 and 100
     or p_last_name is null or length(trim(p_last_name)) not between 1 and 100
     or not exists (select 1 from public.companies where id = p_company_id and active) then
    raise exception 'Los datos del administrador no son válidos' using errcode = '23514';
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
  values (p_user_id, 'RRHH_ADMIN', auth.uid());
  insert into public.profiles (id, first_name, last_name, contact_email)
  values (p_user_id, trim(p_first_name), trim(p_last_name), auth_email)
  returning * into new_profile;
  insert into public.user_company_access (
    user_id, company_id, can_manage_employees, can_manage_documents, can_resolve_requests
  )
  values (
    p_user_id, p_company_id, p_can_manage_employees, p_can_manage_documents, p_can_resolve_requests
  );
  insert into public.audit_logs (actor_id, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_company_id, 'admin.created', 'user', p_user_id,
    jsonb_build_object('role', 'RRHH_ADMIN'));
  return new_profile;
end;
$$;

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
  select p.id, p.first_name, p.last_name, u.email, r.role
  from app_private.user_roles r
  join public.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  order by p.last_name, p.first_name;
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
begin
  if auth.uid() is null or app_private.current_role() is distinct from 'SUPERADMIN'
     or not exists (select 1 from app_private.user_roles where user_id = p_user_id and role = 'RRHH_ADMIN') then
    raise exception 'Solo SUPERADMIN puede configurar accesos administrativos' using errcode = '42501';
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
  if p_role <> 'RRHH_ADMIN' then
    delete from public.user_company_access where user_id = p_user_id;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'user.role.changed', 'user', p_user_id,
    jsonb_build_object('previous_role', current_target_role, 'new_role', p_role));
end;
$$;

revoke all on function public.create_employee_profile(uuid, uuid, text, text, text, text, text, text, text, date) from public, anon;
revoke all on function public.provision_hr_admin(uuid, uuid, text, text, boolean, boolean, boolean) from public, anon;
revoke all on function public.list_managed_users() from public, anon;
revoke all on function public.configure_user_company_access(uuid, uuid, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.configure_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.create_employee_profile(uuid, uuid, text, text, text, text, text, text, text, date) to authenticated;
grant execute on function public.provision_hr_admin(uuid, uuid, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.list_managed_users() to authenticated;
grant execute on function public.configure_user_company_access(uuid, uuid, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.configure_user_role(uuid, public.app_role) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hr-private',
  'hr-private',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy hr_private_read on storage.objects for select to authenticated
  using (
    bucket_id = 'hr-private'
    and exists (
      select 1 from public.employee_documents d
      where d.storage_path = storage.objects.name
        and d.active
        and app_private.can_view_employee(d.employee_id, d.company_id)
    )
  );
create policy hr_private_admin_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hr-private'
    and exists (
      select 1 from public.employee_documents d
      where d.storage_path = storage.objects.name
        and d.active
        and app_private.can_manage_documents(d.company_id)
    )
  );
