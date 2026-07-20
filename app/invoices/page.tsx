"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Invoice {
  id: number;
  filename: string;
  proveedor: string | null;
  fecha: string | null;
  total: number | null;
  moneda: string | null;
  error: string | null;
  created_at: string;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (inv.proveedor?.toLowerCase() || "").includes(q) ||
      (inv.fecha?.toLowerCase() || "").includes(q) ||
      inv.filename.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta factura?")) return;
    await fetch(`/api/invoices?id=${id}`, { method: "DELETE" });
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  };

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📋 Historial de facturas</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {invoices.length} factura{invoices.length !== 1 ? "s" : ""} procesada
            {invoices.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition-colors"
        >
          ← Nueva factura
        </Link>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar por proveedor, fecha o archivo…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm mb-6 focus:outline-none focus:border-[var(--accent)]"
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-[var(--text-muted)]">
            {search ? "Sin resultados" : "Todavía no hay facturas"}
          </p>
          {!search && (
            <Link
              href="/"
              className="inline-block mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm"
            >
              Subir primera factura
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-4 hover:border-[var(--accent)]/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">
                      {inv.proveedor || "Factura"}
                    </span>
                    {inv.error && (
                      <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded">
                        Error
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                    <span>📄 {inv.filename}</span>
                    {inv.fecha && <span>📅 {inv.fecha}</span>}
                    <span className="text-xs">
                      {new Date(inv.created_at).toLocaleString("es")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {inv.total != null && (
                    <span className="text-lg font-bold text-[var(--accent)]">
                      {inv.total.toFixed(2)} {inv.moneda || "€"}
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(inv.id)}
                    className="text-[var(--text-muted)] hover:text-red-400 transition-colors text-sm"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
