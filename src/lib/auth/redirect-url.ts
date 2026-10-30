import "server-only";

export function getAuthRedirectUrl(path: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const siteUrl = configuredUrl ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : null);
  if (!siteUrl) throw new Error("Falta configurar NEXT_PUBLIC_SITE_URL para los enlaces de Auth.");

  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new Error("NEXT_PUBLIC_SITE_URL debe usar HTTPS fuera del entorno local.");
  }
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("La ruta de redirección de Auth no es válida.");
  return new URL(path, base.origin).toString();
}
