import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addCalendarDays, formatDateTime } from "@/lib/utils";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 25;

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export default async function ApplicantsPage({
  searchParams
}: {
  searchParams: Promise<{ empresa?: string; vacante?: string; desde?: string; hasta?: string; q?: string; page?: string }>;
}) {
  await requireUser(["RRHH_ADMIN", "GERENTE", "SUPERADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: companies, error: companyError }, { data: vacancies, error: vacancyError }] = await Promise.all([
    admin.from("companies").select("id, name").order("name"),
    supabase.from("job_vacancies").select("id, company_id, title").order("title")
  ]);
  if (companyError || vacancyError) throw new Error("No se pudieron cargar las empresas y vacantes.");

  const requestedCompanyId = params.empresa ?? "";
  const companyId = uuidPattern.test(requestedCompanyId) && companies?.some((company) => company.id === requestedCompanyId)
    ? requestedCompanyId
    : null;
  const requestedVacancyId = params.vacante ?? "";
  const vacancyId = requestedVacancyId === "otro"
    ? "otro"
    : uuidPattern.test(requestedVacancyId) && vacancies?.some((vacancy) => vacancy.id === requestedVacancyId)
      ? requestedVacancyId
      : null;
  const from = validDate(params.desde);
  const until = validDate(params.hasta);
  const search = (params.q ?? "").replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚüÜñÑ]/g, "").trim().slice(0, 60);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));

  let query = supabase
    .from("job_applications")
    .select("id, first_name, last_name, dni, phone, company_id, vacancy_id, is_spontaneous, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  if (vacancyId === "otro") query = query.is("vacancy_id", null);
  else if (vacancyId) query = query.eq("vacancy_id", vacancyId);
  if (from) query = query.gte("created_at", new Date(`${from}T00:00:00-03:00`).toISOString());
  if (until) query = query.lt("created_at", new Date(`${addCalendarDays(until, 1)}T00:00:00-03:00`).toISOString());
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,dni.ilike.%${search}%`);
  const { data: applications, count, error: applicationError } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (applicationError) throw new Error("No se pudieron consultar las postulaciones.");

  const companyNames = new Map((companies ?? []).map((company) => [company.id, company.name]));
  const vacancyNames = new Map((vacancies ?? []).map((vacancy) => [vacancy.id, vacancy.title]));
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selected = { companyId, vacancyId, from, until, search };
  const filterParams = new URLSearchParams();
  if (companyId) filterParams.set("empresa", companyId);
  if (vacancyId) filterParams.set("vacante", vacancyId);
  if (from) filterParams.set("desde", from);
  if (until) filterParams.set("hasta", until);
  if (search) filterParams.set("q", search);
  const pageHref = (target: number) => `/admin/postulantes?${filterParams.size ? `${filterParams}&` : ""}page=${target}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Postulantes</h1>
        <p className="mt-2 text-sm text-muted-foreground">Consultá las postulaciones recibidas y abrí o descargá sus currículums.</p>
      </div>
      <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-1.5">
          <label htmlFor="q" className="text-xs text-muted-foreground">Nombre, apellido o DNI</label>
          <input id="q" name="q" defaultValue={selected.search} maxLength={60} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="empresa" className="text-xs text-muted-foreground">Empresa</label>
          <select id="empresa" name="empresa" defaultValue={selected.companyId ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Todas</option>
            {(companies ?? []).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="vacante" className="text-xs text-muted-foreground">Vacante</label>
          <select id="vacante" name="vacante" defaultValue={selected.vacancyId ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Todas</option>
            <option value="otro">Otro (espontánea)</option>
            {(vacancies ?? []).map((vacancy) => <option value={vacancy.id} key={vacancy.id}>{vacancy.title} · {companyNames.get(vacancy.company_id) ?? "Empresa"}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="desde" className="text-xs text-muted-foreground">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={selected.from ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hasta" className="text-xs text-muted-foreground">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={selected.until ?? ""} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm" />
        </div>
        <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Aplicar filtros</Button></div>
      </form>
      <Card><CardContent className="p-0">
        {!applications?.length ? <p className="p-8 text-center text-sm text-muted-foreground">No se encontraron postulantes para estos filtros.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-slate-700 bg-slate-900/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Postulante</th>
                  <th className="px-4 py-3 font-medium">DNI</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Vacante</th>
                  <th className="px-4 py-3 font-medium">Fecha de postulación</th>
                  <th className="px-5 py-3 font-medium">Currículum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {applications.map((application) => (
                  <tr key={application.id} className="hover:bg-slate-800/30">
                    <td className="px-5 py-4 font-medium">{application.first_name} {application.last_name}</td>
                    <td className="px-4 py-4">{application.dni}</td>
                    <td className="px-4 py-4">{application.phone}</td>
                    <td className="px-4 py-4">{companyNames.get(application.company_id) ?? "Empresa"}</td>
                    <td className="px-4 py-4">{application.is_spontaneous ? "Otro (espontánea)" : vacancyNames.get(application.vacancy_id ?? "") ?? "Vacante"}</td>
                    <td className="px-4 py-4">{formatDateTime(application.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <Link href={`/api/postulaciones/${application.id}/cv`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200" aria-label={`Abrir CV de ${application.first_name} ${application.last_name}`}>
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir
                        </Link>
                        <Link href={`/api/postulaciones/${application.id}/cv?descargar=1`} className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200" aria-label={`Descargar CV de ${application.first_name} ${application.last_name}`}>
                          <Download className="h-4 w-4" aria-hidden="true" />Descargar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 px-5 py-4 text-sm">
          <span className="text-muted-foreground">{total} postulante(s) · Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Button asChild variant="secondary" size="sm"><Link href={pageHref(page - 1)}>Anterior</Link></Button>}
            {page < totalPages && <Button asChild variant="secondary" size="sm"><Link href={pageHref(page + 1)}>Siguiente</Link></Button>}
          </div>
        </div>
      </CardContent></Card>
    </div>
  );
}
