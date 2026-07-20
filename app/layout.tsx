import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCR Facturas",
  description: "Extrae datos de facturas y tickets con OCR + IA",
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
