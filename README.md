# Portal de Recursos Humanos

Aplicación web para autogestión de empleados y gestión de solicitudes con Next.js App Router, TypeScript, Tailwind CSS y Supabase. La base de datos es PostgreSQL; el almacenamiento de documentos se configura como privado.

## Requisitos

- Node.js 22.12 o posterior y npm.
- Proyecto Supabase (PostgreSQL, Auth y Storage).
- Supabase CLI para aplicar migraciones y generar tipos.

## Desarrollo local

1. Instalar dependencias: `npm install`.
2. Copiar `.env.example` a `.env.local` y completar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` con los valores del proyecto Supabase y el origen de la aplicación.
3. Para desarrollo local, iniciar el stack: `npx supabase start` y luego `npx supabase db reset`. Para un proyecto remoto enlazado, aplicar migraciones: `npx supabase db push`.
4. Iniciar: `npm run dev`.

Comandos de validación: `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`.

## Supabase

- Las migraciones en `supabase/migrations` crean las seis empresas, relaciones, restricciones, funciones de autorización, políticas RLS y el bucket privado `hr-private`.
- No se habilita el alta pública. Cree usuarios mediante invitación desde Auth y asigne el rol/empresa desde un entorno administrativo controlado.
- Las funciones privilegiadas fijan `search_path`, validan `auth.uid()` y limitan `EXECUTE`; la clave `service_role` solo se usa en servidor para invitaciones y, opcionalmente, cron.
- Los documentos nunca deben publicarse. El bucket es privado y las políticas validan la empresa y el empleado vinculados al registro del documento.
- `/api/cron/document-expiry` genera avisos internos idempotentes para empleados y responsables de documentación; no envía correo ni WhatsApp.
- `supabase/scripts/bootstrap-superadmin.sql` describe un procedimiento manual de bootstrap; requiere una cuenta Auth ya creada por un operador autorizado y no tiene endpoint público.

### Primer administrador

1. Desactive el registro público en Supabase Auth y configure las URLs permitidas.
2. Cree/invite la cuenta inicial desde el panel seguro de Supabase Auth.
3. Aplique las migraciones y ejecute `supabase/scripts/bootstrap-superadmin.sql` en SQL Editor con el UUID de esa cuenta. El script aborta si el usuario no existe.
4. Cambie la contraseña mediante el flujo seguro de Auth y mantenga acceso restringido al panel y al historial de cambios.

No hay usuarios ni contraseñas predeterminados. Una vez iniciado el portal y configurada la clave de servidor, RR. HH. puede crear empleados desde **Administración → Empleados**; el sistema invita la cuenta de Auth y crea el legajo vinculado en la misma operación lógica. La invitación abre el formulario privado `/registro`, donde el usuario confirma sus datos personales y crea su contraseña. El alta se completa una sola vez; la recuperación de contraseña usa su flujo separado. El rol, la empresa, los permisos y los datos laborales quedan administrados por RR. HH. Un SUPERADMIN puede enviar un enlace para crear/restablecer contraseña desde **Configuración → Usuarios y roles**; los correos están sujetos a los límites del proveedor Auth. No habilite el registro público.

## Despliegue en Vercel

1. Importe el repositorio en Vercel con el preset Next.js.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` (origen HTTPS de la aplicación) como variables de entorno de producción/preview según corresponda.
3. Ejecute las migraciones contra el proyecto Supabase antes de publicar.
4. Configure las URLs de callback de Auth con el dominio de Vercel.
5. Configure `SUPABASE_SERVICE_ROLE_KEY` únicamente como variable de servidor para que funcionen las invitaciones de empleados y administradores. Si habilita el cron de alertas, configure también `CRON_SECRET` solo en servidor y mantenga `vercel.json` con la ruta programada.

Las claves `NEXT_PUBLIC_*` son públicas; nunca coloque una `service_role` en una variable pública o en el cliente.

## Datos y retención

El seed es reproducible y solo contiene las seis empresas, no personas ficticias. Solicitudes, historial y auditoría usan borrado restringido; los perfiles y documentos se desactivan mediante estado/baja lógica. Defina y apruebe una política legal de retención antes de automatizar la eliminación de datos personales.

## Pruebas RLS

`npm run test:rls` está reservado a pruebas de integración que requieren Supabase local, credenciales temporales de usuarios de prueba y variables explícitas. Las pruebas unitarias no demuestran por sí solas el cumplimiento de RLS; nunca ejecute pruebas de integración con usuarios de producción.

Las pruebas de integración se habilitan con `RUN_LOCAL_RLS_TESTS=true`, URL local (`localhost` o `127.0.0.1`) y usuarios/IDs fixture. Configurá `RLS_EMPLOYEE_EMAIL`, `RLS_EMPLOYEE_PASSWORD`, `RLS_OTHER_REQUEST_ID`, `RLS_OTHER_PROFILE_ID`, `RLS_ADMIN_EMAIL`, `RLS_ADMIN_PASSWORD`, `RLS_UNASSIGNED_REQUEST_ID`, `RLS_UNASSIGNED_PROFILE_ID` y `RLS_PRIVATE_STORAGE_PATH`. `RLS_CONCURRENT_REQUEST_ID` y `RLS_PENDING_CHANGE_ID` son opcionales y sus casos se omiten cuando no se especifican; deben ser fixtures desechables locales porque la prueba de concurrencia resuelve la solicitud.

## Importación de empleados

Desde **Administración → Empleados → Importar CSV** se puede cargar un archivo UTF-8 de hasta 1 MB y 100 filas. Las columnas obligatorias son `email`, `first_name`, `last_name`, `employee_number` y `company_code`; `department`, `position`, `phone`, `address` y `hire_date` son opcionales. La fecha usa `AAAA-MM-DD` y el código de empresa debe estar activo y habilitado para quien importa. La vista previa valida el formato y muestra errores por fila; se detectan correos y legajos repetidos dentro del archivo, y las restricciones de la base de datos evitan duplicar legajos existentes. Cada fila se procesa individualmente, por lo que el reporte puede reflejar altas correctas junto con fallos parciales. Las invitaciones requieren `SUPABASE_SERVICE_ROLE_KEY` configurada solo en el servidor.
