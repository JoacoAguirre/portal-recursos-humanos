import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser(["EMPLEADO"]);
  return <AppShell user={user} role={user.role}>{children}</AppShell>;
}
