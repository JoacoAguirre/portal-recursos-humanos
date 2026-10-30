import { z } from "zod";

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "La fecha de ingreso debe tener formato AAAA-MM-DD.");

export const employeeImportRowSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  employee_number: z.string().trim().min(1).max(60),
  company_code: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  department: z.string().trim().max(120).optional(),
  position: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  hire_date: dateSchema.optional()
});

export type EmployeeImportRow = z.infer<typeof employeeImportRowSchema>;

export type ParsedEmployeeImportRow = {
  line: number;
  data?: EmployeeImportRow;
  error?: string;
};

export function findEmployeeImportDuplicateErrors(
  rows: { line: number; data: EmployeeImportRow }[]
) {
  const errors = new Map<number, string>();
  const indexesByEmail = new Map<string, number[]>();
  const indexesByEmployeeNumber = new Map<string, number[]>();

  for (const row of rows) {
    const email = row.data.email.toLowerCase();
    const employeeNumber = row.data.employee_number.toLowerCase();
    indexesByEmail.set(email, [...(indexesByEmail.get(email) ?? []), row.line]);
    indexesByEmployeeNumber.set(
      employeeNumber,
      [...(indexesByEmployeeNumber.get(employeeNumber) ?? []), row.line]
    );
  }
  for (const lineNumbers of indexesByEmail.values()) {
    if (lineNumbers.length > 1) {
      for (const line of lineNumbers) errors.set(line, "El correo está duplicado en el archivo.");
    }
  }
  for (const lineNumbers of indexesByEmployeeNumber.values()) {
    if (lineNumbers.length > 1) {
      for (const line of lineNumbers) errors.set(line, "El legajo está duplicado en el archivo.");
    }
  }
  return errors;
}

const requiredHeaders = ["email", "first_name", "last_name", "employee_number", "company_code"];
const allowedHeaders = new Set([
  ...requiredHeaders,
  "department",
  "position",
  "phone",
  "address",
  "hire_date"
]);

function parseCsvMatrix(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0 || closedQuote) throw new Error("Formato CSV inválido: comillas fuera de lugar.");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
    } else if (character === "\n" || character === "\r") {
      if (closedQuote === false && field.includes('"')) {
        throw new Error("Formato CSV inválido: comillas sin escapar.");
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      closedQuote = false;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      if (closedQuote) throw new Error("Formato CSV inválido: hay texto después de una comilla de cierre.");
      field += character;
    }
  }

  if (quoted) throw new Error("Formato CSV inválido: falta cerrar una comilla.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function parseEmployeeCsv(source: string): ParsedEmployeeImportRow[] {
  const matrix = parseCsvMatrix(source);
  if (matrix.length < 2) throw new Error("El CSV debe incluir encabezados y al menos una fila.");

  const headers = matrix[0].map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("El CSV contiene encabezados duplicados.");
  if (requiredHeaders.some((header) => !headers.includes(header))) {
    throw new Error(`El CSV debe incluir estas columnas: ${requiredHeaders.join(", ")}.`);
  }
  if (headers.some((header) => !allowedHeaders.has(header))) {
    throw new Error("El CSV contiene una columna no reconocida.");
  }

  return matrix.slice(1).map((cells, index) => {
    const line = index + 2;
    if (cells.length !== headers.length) {
      return { line, error: "La cantidad de columnas no coincide con los encabezados." };
    }
    const values = Object.fromEntries(
      headers.map((header, cellIndex) => [header, cells[cellIndex].trim() || undefined])
    );
    const parsed = employeeImportRowSchema.safeParse(values);
    if (!parsed.success) {
      return { line, error: parsed.error.issues[0]?.message ?? "La fila no es válida." };
    }
    return { line, data: parsed.data };
  });
}
