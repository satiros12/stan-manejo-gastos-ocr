import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestión en Pareja",
  description: "Control de gastos en pareja: compartidos y privados, con OCR de facturas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
