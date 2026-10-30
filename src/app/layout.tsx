import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Portal de Recursos Humanos",
    template: "%s | Portal de Recursos Humanos"
  },
  description: "Portal seguro de autogestión y gestión de Recursos Humanos."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
