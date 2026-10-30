import Link from "next/link";
import {
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Users
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppRole } from "@/types/database";
import { Button } from "@/components/ui/button";

const employeeLinks = [
  { href: "/portal", label: "Inicio", icon: LayoutDashboard },
  { href: "/portal/solicitudes", label: "Mis solicitudes", icon: ClipboardList },
  { href: "/portal/solicitudes/nueva", label: "Nueva solicitud", icon: BriefcaseBusiness },
  { href: "/portal/documentos", label: "Mis documentos", icon: FileText },
  { href: "/portal/perfil", label: "Mi perfil", icon: Users },
  { href: "/portal/notificaciones", label: "Notificaciones", icon: Bell }
];

const adminLinks = [
  { href: "/admin", label: "Tablero", icon: LayoutDashboard },
  { href: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardList },
  { href: "/admin/empleados", label: "Empleados", icon: Users },
  { href: "/admin/documentos", label: "Documentación", icon: FileText },
  { href: "/admin/notificaciones", label: "Notificaciones", icon: Bell },
  { href: "/admin/historial", label: "Historial", icon: Bell },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings }
];

export function AppShell({
  user,
  role,
  children
}: {
  user: AuthenticatedUser;
  role: AppRole;
  children: React.ReactNode;
}) {
  const isAdmin = role !== "EMPLEADO";
  const links = isAdmin ? adminLinks : employeeLinks;
  const fullName = `${user.profile.first_name} ${user.profile.last_name}`;
  const homeHref = isAdmin ? "/admin" : "/portal";
  const organizationLabel = user.companyName ?? (
    role === "SUPERADMIN"
      ? "Administración global"
      : role === "RRHH_ADMIN"
        ? "Recursos Humanos"
        : "Portal del empleado"
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b bg-slate-950/70 md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <Link href={homeHref} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
              <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Portal RR. HH.</span>
              <span className="block text-xs text-muted-foreground">Gestión de personas</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Navegación principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:py-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 p-4 md:block">
          <p className="truncate text-sm font-medium">{fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{organizationLabel}</p>
          <form action={logoutAction} className="mt-3">
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Cerrar sesión
            </Button>
          </form>
        </div>
        <div className="px-4 pb-4 md:hidden">
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Salir
            </Button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1 md:pl-64">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b bg-slate-950/90 px-5 backdrop-blur md:px-8">
          <div className="text-sm text-muted-foreground">
            {isAdmin ? "Administración de RR. HH." : user.companyName ?? "Portal del empleado"}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{fullName}</p>
            <p className="text-xs text-muted-foreground">{role === "SUPERADMIN" ? "Superadministración" : role === "RRHH_ADMIN" ? "Recursos Humanos" : "Empleado"}</p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
