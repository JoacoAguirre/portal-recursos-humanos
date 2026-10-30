"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { importEmployeesAction } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  findEmployeeImportDuplicateErrors,
  parseEmployeeCsv,
  type ParsedEmployeeImportRow
} from "@/lib/validations/employees";
import { Company } from "@/types/database";

const csvTemplate = [
  "email,first_name,last_name,employee_number,company_code,department,position,phone,address,hire_date",
  "ana@example.com,Ana,Pérez,E-001,IVVT,Ventas,Analista,1122334455,\"Calle 123, Buenos Aires\",2024-01-15"
].join("\n");

type ImportReport = { line: number; success: boolean; message: string };

export function EmployeeCsvImportForm({ companies }: { companies: Company[] }) {
  const [rows, setRows] = useState<ParsedEmployeeImportRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [report, setReport] = useState<ImportReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const companyCodes = new Set(companies.map((company) => company.code.toUpperCase()));
  const duplicateErrors = findEmployeeImportDuplicateErrors(
    rows.flatMap((row) => row.data ? [{ line: row.line, data: row.data }] : [])
  );

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]);
    setReport(null);
    setParseError("");
    if (!file) return;
    if (file.size > 1_000_000) {
      setParseError("El archivo supera el límite de 1 MB.");
      return;
    }
    try {
      const parsed = parseEmployeeCsv(await file.text());
      if (parsed.length > 100) {
        setParseError("El archivo puede contener hasta 100 filas.");
        return;
      }
      setRows(parsed);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "No se pudo leer el archivo CSV.");
    }
  }

  async function onImport() {
    setLoading(true);
    setReport(null);
    try {
      const localReport = rows.flatMap((row) => {
        if (row.error) return [{ line: row.line, success: false, message: row.error }];
        const duplicateError = duplicateErrors.get(row.line);
        if (duplicateError) return [{ line: row.line, success: false, message: duplicateError }];
        if (row.data && !companyCodes.has(row.data.company_code)) {
          return [{ line: row.line, success: false, message: "Empresa no habilitada para tu usuario." }];
        }
        return [];
      });
      const validRows = rows.flatMap((row) =>
        row.data && !duplicateErrors.has(row.line) && companyCodes.has(row.data.company_code)
          ? [{ line: row.line, employee: row.data }]
          : []
      );
      if (!validRows.length) {
        setReport(localReport);
        return;
      }
      const result = await importEmployeesAction(validRows);
      if (!result.ok) {
        setParseError(result.error);
        return;
      }
      setReport([...localReport, ...result.rows].sort((a, b) => a.line - b.line));
    } catch {
      setParseError("No se pudo completar la importación. Revisá tu conexión e intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const invalidCompanyCount = rows.filter(
    (row) => row.data && !companyCodes.has(row.data.company_code)
  ).length;
  const invalidRows = rows.filter((row) => !row.data || duplicateErrors.has(row.line)).length;
  const importableRows = rows.filter(
    (row) => row.data && !duplicateErrors.has(row.line) && companyCodes.has(row.data.company_code)
  ).length;
  const canImport = importableRows > 0 && !loading && report === null;

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>Subí un CSV UTF-8 de hasta 100 filas. Las columnas obligatorias son correo, nombre, apellido, legajo y código de empresa.</p>
        <p>Los códigos habilitados para tu usuario: {companies.map((company) => company.code).join(", ")}.</p>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvTemplate)}`}
          download="plantilla-empleados.csv"
          className="inline-flex text-blue-300 underline underline-offset-4 hover:text-blue-200"
        >
          Descargar plantilla CSV
        </a>
      </div>

      <div className="space-y-2">
        <label htmlFor="employee-csv" className="text-sm font-medium">Archivo CSV</label>
        <input
          id="employee-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          disabled={loading}
          className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-100"
        />
      </div>

      {parseError && <p role="alert" className="text-sm text-red-300">{parseError}</p>}

      {!!rows.length && (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">
                Vista previa: {rows.length} fila(s), {invalidRows} con errores de formato o duplicados
                {invalidCompanyCount ? ` y ${invalidCompanyCount} con empresa no habilitada` : ""}.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="border-b border-slate-700 text-xs uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Correo</th><th className="px-3 py-2">Legajo</th><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Validación</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {rows.map((row) => {
                      const companyAllowed = row.data ? companyCodes.has(row.data.company_code) : false;
                      const message = row.error ?? duplicateErrors.get(row.line) ?? (!companyAllowed ? "Empresa no habilitada para tu usuario." : "Lista para importar.");
                      return (
                        <tr key={row.line}>
                          <td className="px-3 py-2">{row.line}</td>
                          <td className="px-3 py-2">{row.data?.email ?? "—"}</td>
                          <td className="px-3 py-2">{row.data?.employee_number ?? "—"}</td>
                          <td className="px-3 py-2">{row.data?.company_code ?? "—"}</td>
                          <td className={`px-3 py-2 ${row.error || !companyAllowed ? "text-red-300" : "text-emerald-300"}`}>{message}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={onImport} disabled={!canImport}>
              {loading ? "Importando..." : `Importar ${importableRows} fila(s) válida(s)`}
            </Button>
          </div>
        </>
      )}

      {report && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-medium">Resultado de la importación</h2>
            <p className="text-sm text-muted-foreground">
              {report.filter((row) => row.success).length} alta(s) completada(s) de {report.length} fila(s) enviadas.
            </p>
            <ul className="space-y-2 text-sm">
              {report.map((row) => (
                <li key={row.line} className={row.success ? "text-emerald-300" : "text-red-300"}>
                  Fila {row.line}: {row.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
