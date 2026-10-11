"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";

const NAV_ITEMS = [
  { href: "/app/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/app/transactions", label: "Gastos", icon: "💳" },
  { href: "/app/import", label: "Importar", icon: "📥" },
  { href: "/app/categories", label: "Categorías", icon: "🏷️" },
  { href: "/app/ocr", label: "OCR Factura", icon: "📄" },
  { href: "/app/settings", label: "Ajustes", icon: "⚙️" },
  { href: "/app/balance", label: "Balance", icon: "⚖️" },
];

function AppContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="spinner w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--color-bg)" }}>
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:inset-auto`}
        style={{ background: "var(--color-bg-card)", borderRight: "1px solid var(--color-border)" }}
      >
        <div className="p-5 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-bold text-lg">💰 Gestión en Pareja</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{session.user?.email}</p>
        </div>

        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-900/10 w-full transition-colors"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <button onClick={() => setSidebarOpen(true)} className="text-xl">
            ☰
          </button>
          <h1 className="font-bold">💰 Gestión en Pareja</h1>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppContent>{children}</AppContent>
    </SessionProvider>
  );
}
