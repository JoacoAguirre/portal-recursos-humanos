"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CV_MIME_TYPES, getCvFormat, MAX_CV_SIZE } from "@/lib/validations/applications";

type CompanyOption = { id: string; name: string };
type VacancyOption = { id: string; title: string };

export function ApplicantForm({ companies }: { companies: CompanyOption[] }) {
  const [companyId, setCompanyId] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [vacancies, setVacancies] = useState<VacancyOption[]>([]);
  const [vacancyLoading, setVacancyLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const controller = new AbortController();
    fetch(`/api/postulaciones/vacantes?empresa=${encodeURIComponent(companyId)}`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then(async (response) => {
        const result = await response.json() as { vacancies?: VacancyOption[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar las vacantes.");
        setVacancies(result.vacancies ?? []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se pudieron cargar las vacantes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setVacancyLoading(false);
      });
    return () => controller.abort();
  }, [companyId]);

  function onFileChange(file: File | undefined) {
    setError("");
    setFileName("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const expectedMime = extension ? CV_MIME_TYPES[extension as keyof typeof CV_MIME_TYPES] : undefined;
    if (!expectedMime || file.type !== expectedMime) {
      setError("El CV debe ser un archivo PDF, DOC o DOCX.");
      return;
    }
    if (file.size < 1 || file.size > MAX_CV_SIZE) {
      setError("El CV debe tener un tamaño máximo de 5 MB.");
      return;
    }
    setFileName(file.name);
  }

  async function submitApplication(formData: FormData) {
    setError("");
    setSuccess(false);
    const file = formData.get("cv");
    if (!(file instanceof File) || !file.size) {
      setError("Adjuntá tu currículum vitae para continuar.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    const expectedMime = extension ? CV_MIME_TYPES[extension as keyof typeof CV_MIME_TYPES] : undefined;
    if (!expectedMime || file.type !== expectedMime) {
      setError("El CV debe ser un archivo PDF, DOC o DOCX.");
      return;
    }
    if (file.size > MAX_CV_SIZE) {
      setError("El CV debe tener un tamaño máximo de 5 MB.");
      return;
    }
    setLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!getCvFormat(file.name, file.type, bytes)) {
        setError("El contenido del CV no coincide con un PDF, DOC o DOCX válido.");
        return;
      }
      const response = await fetch("/api/postulaciones", { method: "POST", body: formData });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "No se pudo enviar la postulación.");
        return;
      }
      setSuccess(true);
      setCompanyId("");
      setVacancyId("");
      setFileName("");
      (document.getElementById("applicant-form") as HTMLFormElement | null)?.reset();
    } catch {
      setError("No se pudo conectar con el servicio de postulaciones. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      id="applicant-form"
      className="mt-7 space-y-5 rounded-xl border bg-card p-5 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        void submitApplication(new FormData(event.currentTarget));
      }}
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="company_id" className="text-sm font-medium">Empresa</label>
          <select
            id="company_id"
            name="company_id"
            required
            value={companyId}
            onChange={(event) => {
              const nextCompanyId = event.target.value;
              setCompanyId(nextCompanyId);
              setVacancyId("");
              setVacancies([]);
              setVacancyLoading(Boolean(nextCompanyId));
              setError("");
            }}
            className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm"
          >
            <option value="" disabled>Seleccioná una empresa</option>
            {companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="vacancy_id" className="text-sm font-medium">Vacante</label>
          <select
            id="vacancy_id"
            name="vacancy_id"
            required
            value={vacancyId}
            onChange={(event) => setVacancyId(event.target.value)}
            disabled={!companyId || vacancyLoading}
            className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm disabled:opacity-60"
          >
            <option value="" disabled>{vacancyLoading ? "Cargando vacantes..." : "Seleccioná una opción"}</option>
            {vacancies.map((vacancy) => <option value={vacancy.id} key={vacancy.id}>{vacancy.title}</option>)}
            {companyId && <option value="otro">Otro</option>}
          </select>
          <p className="text-xs text-muted-foreground">“Otro” permite enviar una postulación espontánea.</p>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="first_name" className="text-sm font-medium">Nombre</label>
          <Input id="first_name" name="first_name" required maxLength={100} autoComplete="given-name" />
        </div>
        <div className="space-y-2">
          <label htmlFor="last_name" className="text-sm font-medium">Apellido</label>
          <Input id="last_name" name="last_name" required maxLength={100} autoComplete="family-name" />
        </div>
        <div className="space-y-2">
          <label htmlFor="dni" className="text-sm font-medium">DNI</label>
          <Input id="dni" name="dni" required inputMode="numeric" minLength={7} maxLength={8} pattern="[0-9]{7,8}" />
        </div>
        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium">Número de teléfono</label>
          <Input id="phone" name="phone" required type="tel" maxLength={40} pattern="\+?[0-9 ()-]{6,40}" autoComplete="tel" />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="cv" className="text-sm font-medium">Currículum Vitae</label>
        <label htmlFor="cv" className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-slate-900/60 px-4 py-3 text-sm text-slate-200 transition hover:border-blue-400">
          <Upload className="h-4 w-4 text-blue-300" aria-hidden="true" />
          {fileName || "Seleccionar archivo PDF, DOC o DOCX (máx. 5 MB)"}
        </label>
        <input
          id="cv"
          name="cv"
          type="file"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(event) => onFileChange(event.target.files?.[0])}
        />
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {success && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">Recibimos tu postulación. ¡Gracias por tu interés!</p>}
      <Button type="submit" className="w-full sm:w-auto" disabled={loading || !companies.length}>
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Enviando..." : "Enviar postulación"}
      </Button>
      {!companies.length && <p className="text-sm text-amber-300">En este momento no hay empresas disponibles para postularse.</p>}
    </form>
  );
}
