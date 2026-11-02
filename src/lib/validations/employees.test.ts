import { describe, expect, it } from "vitest";
import { findEmployeeImportDuplicateErrors, parseEmployeeCsv } from "./employees";

describe("importación CSV de empleados", () => {
  it("parsea filas con campos entrecomillados, comas y BOM", () => {
    const rows = parseEmployeeCsv(
      '\uFEFFemail,first_name,last_name,dni,employee_number,company_code,department,hire_date\nana@example.com,Ana,"Pérez, Díaz",30123456,E-01,ivvt,"Ventas, Norte",2024-01-15\n'
    );
    expect(rows).toEqual([
      {
        line: 2,
        data: {
          email: "ana@example.com",
          first_name: "Ana",
          last_name: "Pérez, Díaz",
          dni: "30123456",
          employee_number: "E-01",
          company_code: "IVVT",
          department: "Ventas, Norte",
          hire_date: "2024-01-15"
        }
      }
    ]);
  });

  it("informa errores por fila y rechaza encabezados incompletos", () => {
    const rows = parseEmployeeCsv(
      "email,first_name,last_name,dni,employee_number,company_code,hire_date\nno-es-email,Ana,Pérez,30123456,E-01,IVVT,2024-01-15\n"
    );
    expect(rows[0]?.error).toBeTruthy();
    expect(() => parseEmployeeCsv("email,first_name\nana@example.com,Ana\n")).toThrow("El CSV debe incluir estas columnas");
  });

  it("rechaza archivos con comillas sin cerrar", () => {
    expect(() =>
      parseEmployeeCsv('email,first_name,last_name,dni,employee_number,company_code,hire_date\na@example.com,"Ana,Pérez,30123456,E-01,IVVT,2024-01-15')
    ).toThrow("falta cerrar una comilla");
  });

  it("marca todas las filas con correo o legajo duplicado, sin distinguir mayúsculas", () => {
    const rows = parseEmployeeCsv(
      "email,first_name,last_name,dni,employee_number,company_code,hire_date\nana@example.com,Ana,Pérez,30123456,E-01,IVVT,2024-01-15\nANA@example.com,Ana,Pérez,30123457,e-01,IVVC,2024-01-15\n"
    ).flatMap((row) => row.data ? [{ line: row.line, data: row.data }] : []);
    const errors = findEmployeeImportDuplicateErrors(rows);
    expect(errors.get(2)).toBe("El legajo está duplicado en el archivo.");
    expect(errors.get(3)).toBe("El legajo está duplicado en el archivo.");
  });

  it("rechaza DNI repetidos en una importación", () => {
    const rows = parseEmployeeCsv(
      "email,first_name,last_name,dni,employee_number,company_code,hire_date\na@example.com,Ana,Pérez,30123456,E-01,IVVT,2024-01-15\nb@example.com,Beto,Pérez,30123456,E-02,IVVT,2024-01-15\n"
    ).flatMap((row) => row.data ? [{ line: row.line, data: row.data }] : []);
    const errors = findEmployeeImportDuplicateErrors(rows);
    expect(errors.get(2)).toBe("El DNI está duplicado en el archivo.");
    expect(errors.get(3)).toBe("El DNI está duplicado en el archivo.");
  });
});
