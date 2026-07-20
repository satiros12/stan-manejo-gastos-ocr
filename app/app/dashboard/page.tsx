"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  month: string;
  total_shared: number;
  total_private_me: number;
  total_private_other: number;
  my_shared_paid: number;
  my_share_owed: number;
  other_share_owed: number;
  balance: number;
  by_category: { name: string; icon: string; amount: number; type: string }[];
  recent: any[];
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    setLoading(true);
    fetch(`/api/dashboard?month=${month}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, session]);

  // Auto-refresh when returning to this tab
  useEffect(() => {
    const onFocus = () => {
      if (session?.user?.id) {
        fetch(`/api/dashboard?month=${month}`)
          .then(r => r.json())
          .then(d => setData(d))
          .catch(() => {});
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [month, session]);

  const monthLabel = (() => {
    const [y, m] = month.split("-");
    return `${MONTHS[parseInt(m) - 1]} ${y}`;
  })();

  const formatMoney = (n: number | null | undefined) => {
    if (n == null) return "0,00 €";
    return `${n.toFixed(2).replace(".", ",")} €`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Resumen del mes</p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
        >
          {Array.from({ length: 12 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const lbl = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Cargando…</div>
      ) : !data ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Sin datos</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiCard
              title="Gasto compartido"
              value={formatMoney(data.total_shared)}
              color="#0f8a5f"
            />
            <KpiCard
              title="Mis gastos privados"
              value={formatMoney(data.total_private_me)}
              color="#6366f1"
            />
            <KpiCard
              title="Equilibrio del mes"
              value={formatMoney(data.other_share_owed - data.my_share_owed)}
              color={data.other_share_owed - data.my_share_owed >= 0 ? "#0f8a5f" : "#ef4444"}
              subtitle={data.other_share_owed - data.my_share_owed >= 0 ? "Te deben" : "Debes"}
            />
            <KpiCard
              title="Balance total"
              value={formatMoney(data.balance)}
              color={data.balance >= 0 ? "#0f8a5f" : "#ef4444"}
              subtitle={data.balance >= 0 ? "Te deben" : "Debes"}
            />
          </div>

          {/* By category */}
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6">
            <h2 className="font-semibold mb-3">Gastos por categoría</h2>
            {data.by_category.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Sin gastos este mes</p>
            ) : (
              <div className="space-y-2">
                {data.by_category.map((cat, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-sm">
                      {cat.icon || "📦"} {cat.name || "Sin categoría"}
                    </span>
                    <span className="text-sm font-medium">
                      {formatMoney(cat.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Últimos gastos</h2>
              <Link href="/app/transactions" className="text-xs text-[var(--color-accent)] hover:underline">
                Ver todos →
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Sin gastos aún</p>
            ) : (
              <div className="space-y-2">
                {data.recent.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {t.category_icon || "💳"} {t.description || t.category_name || "Gasto"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {t.user_name} · {t.type === "shared" ? "Compartido" : "Privado"} · {t.date}
                      </p>
                    </div>
                    <span className="text-sm font-medium ml-3">
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, color, subtitle }: { title: string; value: string; color: string; subtitle?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4">
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{title}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{subtitle}</p>
      )}
    </div>
  );
}
