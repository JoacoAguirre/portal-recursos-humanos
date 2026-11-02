"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPayrollSlipAction } from "@/app/actions/payroll";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";

export type PayrollEmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string | null;
  company_name: string;
};

export function UploadPayrollSlipForm({ employees }: { employees: PayrollEmployeeOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    setLoading(true);
    const form = event.currentTarget;
    try {
      const result = await uploadPayrollSlipAction(new FormData(form));
      if (!result.ok) setMessage(result.error);
      else {
        setSuccess(true);
        form.reset();
        router.refresh();
      }
    } catch {
      setMessage("No se pudo cargar el recibo. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="payroll_employee_id" className="text-sm font-medium">Empleado</label>
          <select required name="employee_id" id="payroll_employee_id" className="h-10 w-full rounded-lg border bg-slate-900 px-3 text-sm">
            <option value="">Seleccioná un empleado</option>
            {employees.map((employee) => (
              <option value={employee.id} key={employee.id}>
                {employee.last_name}, {employee.first_name} · {employee.employee_number ?? "Sin legajo"} · {employee.company_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="pay_period" className="text-sm font-medium">Fecha del recibo</label>
          <DateInput id="pay_period" name="pay_period" required />
        </div>
        <div className="space-y-2">
          <label htmlFor="payroll_file" className="text-sm font-medium">Recibo PDF (máximo 10 MB)</label>
          <Input id="payroll_file" name="file" type="file" accept=".pdf,application/pdf" required />
        </div>
      </div>
      {message && <p role={success ? "status" : "alert"} className={success ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message}</p>}
      <Button type="submit" disabled={loading || !employees.length}>{loading ? "Cargando..." : "Cargar recibo"}</Button>
    </form>
  );
}
