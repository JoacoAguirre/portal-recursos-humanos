import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";

export default async function HomePage() {
  const user = await requireUser();
  redirect(user.role === "EMPLEADO" ? "/portal" : "/admin");
}
