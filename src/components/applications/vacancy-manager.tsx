"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createJobVacancyAction,
  deleteJobVacancyAction,
  setJobVacancyActiveAction,
  updateJobVacancyAction
} from "@/app/actions/applications";

type Company = { id: string; name: string; active: boolean };
type Vacancy = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  active: boolean;
  companyName: string;
};
type Result = { ok: true } | { ok: false; error: string };

export function VacancyManager({ companies, vacancies }: { companies: Company[]; vacancies: Vacancy[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function createVacancy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    startTransition(async () => {
      const result = await createJobVacancyAction({
        company_id: values.get("company_id"),
        title: values.get("title"),
        description: values.get("description")
      });
      setMessage(result.ok ? "La vacante se creó correctamente." : result.error);
      if (result.ok) form.reset();
    });
  }

  return (
    <div className="space-y-7">
      <form onSubmit={createVacancy} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="space-y-2">
          <label htmlFor="new-company" className="text-sm font-medium">Empresa</label>
          <select id="new-company" name="company_id" required defaultValue="" className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="" disabled>Seleccioná una empresa</option>
            {companies.filter((company) => company.active).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="new-title" className="text-sm font-medium">Nombre del puesto</label>
          <Input id="new-title" name="title" required maxLength={120} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="new-description" className="text-sm font-medium">Descripción (opcional)</label>
          <Textarea id="new-description" name="description" maxLength={4000} />
        </div>
        <Button type="submit" disabled={pending || !companies.some((company) => company.active)}>Crear vacante</Button>
      </form>
      {message && <p role="status" className="text-sm text-blue-200">{message}</p>}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Vacantes existentes</h2>
        {!vacancies.length
          ? <p className="text-sm text-muted-foreground">Todavía no hay vacantes.</p>
          : vacancies.map((vacancy) => <VacancyEditor key={vacancy.id} vacancy={vacancy} companies={companies} />)}
      </section>
    </div>
  );
}

function VacancyEditor({ vacancy, companies }: { vacancy: Vacancy; companies: Company[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function updateVacancy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateJobVacancyAction({
        id: vacancy.id,
        company_id: values.get("company_id"),
        title: values.get("title"),
        description: values.get("description")
      });
      setMessage(result.ok ? "Cambios guardados." : result.error);
    });
  }

  function changeActive(active: boolean) {
    startTransition(async () => {
      const result = await setJobVacancyActiveAction({ id: vacancy.id, active });
      setMessage(result.ok ? (active ? "Vacante activada." : "Vacante desactivada.") : result.error);
    });
  }

  function removeVacancy() {
    if (!window.confirm("¿Querés eliminar esta vacante? Las vacantes con postulaciones asociadas no se pueden eliminar.")) return;
    startTransition(async () => {
      const result: Result = await deleteJobVacancyAction(vacancy.id);
      setMessage(result.ok ? "Vacante eliminada." : result.error);
    });
  }

  return (
    <article className="rounded-xl border border-slate-700 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{vacancy.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{vacancy.companyName} · {vacancy.active ? "Activa" : "Inactiva"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => changeActive(!vacancy.active)}>
            {vacancy.active ? "Desactivar" : "Activar"}
          </Button>
          <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={removeVacancy}>Eliminar</Button>
        </div>
      </div>
      <form onSubmit={updateVacancy} className="grid gap-3 sm:grid-cols-2" noValidate>
        <div className="space-y-2">
          <label htmlFor={`company-${vacancy.id}`} className="text-xs text-muted-foreground">Empresa</label>
          <select id={`company-${vacancy.id}`} name="company_id" defaultValue={vacancy.company_id} className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
            {companies.map((company) => <option value={company.id} key={company.id}>{company.name}{company.active ? "" : " (inactiva)"}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor={`title-${vacancy.id}`} className="text-xs text-muted-foreground">Nombre del puesto</label>
          <Input id={`title-${vacancy.id}`} name="title" defaultValue={vacancy.title} required maxLength={120} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor={`description-${vacancy.id}`} className="text-xs text-muted-foreground">Descripción</label>
          <Textarea id={`description-${vacancy.id}`} name="description" defaultValue={vacancy.description ?? ""} maxLength={4000} />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>Guardar cambios</Button>
          {message && <p role="status" className="text-sm text-blue-200">{message}</p>}
        </div>
      </form>
    </article>
  );
}
