import { describe, expect, it } from "vitest";
import { findEmployeeImportDuplicateErrors, parseEmployeeCsv } from "./employees";

describe("importación CSV de empleados", () => {
  it("parsea filas con campos entrecomillados, comas y BOM", () => {
    const rows = parseEmployeeCsv(
      '\uFEFFemail,first_name,last_name,employee_number,company_code,department\nana@example.com,Ana,"Pérez, Díaz",E-01,ivvt,"Ventas, Norte"\n'
    );
    expect(rows).toEqual([
      {
        line: 2,
        data: {
          email: "ana@example.com",
          first_name: "Ana",
          last_name: "Pérez, Díaz",
          employee_number: "E-01",
          company_code: "IVVT",
          department: "Ventas, Norte"
        }
      }
    ]);
  });

  it("informa errores por fila y rechaza encabezados incompletos", () => {
    const rows = parseEmployeeCsv(
      "email,first_name,last_name,employee_number,company_code\nno-es-email,Ana,Pérez,E-01,IVVT\n"
    );
    expect(rows[0]?.error).toBeTruthy();
    expect(() => parseEmployeeCsv("email,first_name\nana@example.com,Ana\n")).toThrow("El CSV debe incluir estas columnas");
  });

  it("rechaza archivos con comillas sin cerrar", () => {
    expect(() =>
      parseEmployeeCsv('email,first_name,last_name,employee_number,company_code\na@example.com,"Ana,Pérez,E-01,IVVT')
    ).toThrow("falta cerrar una comilla");
  });

  it("marca todas las filas con correo o legajo duplicado, sin distinguir mayúsculas", () => {
    const rows = parseEmployeeCsv(
      "email,first_name,last_name,employee_number,company_code\nana@example.com,Ana,Pérez,E-01,IVVT\nANA@example.com,Ana,Pérez,e-01,IVVC\n"
    ).flatMap((row) => row.data ? [{ line: row.line, data: row.data }] : []);
    const errors = findEmployeeImportDuplicateErrors(rows);
    expect(errors.get(2)).toBe("El legajo está duplicado en el archivo.");
    expect(errors.get(3)).toBe("El legajo está duplicado en el archivo.");
  });
});
