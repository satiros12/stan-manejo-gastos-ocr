"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface User {
  id: number;
  name: string;
  email: string;
  color: string;
}

interface Transfer {
  id: number;
  from_user_id: number;
  to_user_id: number;
  amount: number;
  date: string;
  description: string;
  type: string;
  from_name?: string;
  to_name?: string;
}

export default function BalancePage() {
  const { data: session } = useSession();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [balance, setBalance] = useState(0);
  const [other, setOther] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });

  const userId = parseInt(session?.user?.id || "0");

  const load = async () => {
    const [balRes, userRes] = await Promise.all([
      fetch("/api/data?_resource=balance"),
      fetch("/api/data?_resource=users"),
    ]);
    const balData = await balRes.json();
    const userData = await userRes.json();
    setBalance(balData.balance || 0);
    setOther(balData.other || null);
    setUsers(userData.users || []);

    // Get transfers
    if (userId) {
      const txRes = await fetch("/api/data?_resource=transfers");
      const txData = await txRes.json();
      setTransfers(txData.transfers || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (userId) load(); }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!other) return;
    // I'm paying the other person
    await fetch("/api/data?_resource=transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_user_id: userId,
        to_user_id: other.id,
        amount: parseFloat(form.amount),
        date: form.date,
        description: form.description,
      }),
    });
    setShowForm(false);
    setForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
    load();
  };

  const formatMoney = (n: number) => `${Math.abs(n).toFixed(2).replace(".", ",")} €`;

  if (loading) return <div className="text-center py-12 text-[var(--color-text-muted)]">Cargando…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">⚖️ Balance</h1>

      {/* Balance card */}
      <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 text-center mb-6">
        {other ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              Balance con <span style={{ color: other.color }}>{other.name}</span>
            </p>
            <p className="text-4xl font-bold mb-2" style={{ color: balance >= 0 ? "var(--color-accent)" : "#ef4444" }}>
              {formatMoney(balance)}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {balance >= 0
                ? `${other.name} te debe ${formatMoney(balance)}`
                : `Le debes ${formatMoney(balance)} a ${other?.name}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Esperando al segundo usuario</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button onClick={() => setShowForm(!showForm)}
          className="flex-1 py-3 rounded-lg text-white text-sm font-medium"
          style={{ background: other ? "var(--color-accent)" : "gray" }}
          disabled={!other}>
          + Registrar pago
        </button>
        <button onClick={() => setShowForm(false)}
          className="flex-1 py-3 rounded-lg text-white text-sm font-medium"
          style={{ background: "#6366f1" }}>
          🔄 Liquidar
        </button>
      </div>

      {/* Payment form */}
      {showForm && other && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6 space-y-4">
          <p className="text-sm">Pago de <strong>{session?.user?.name}</strong> a <strong>{other.name}</strong></p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Importe (€)</label>
              <input type="number" step="0.01" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Fecha</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Concepto</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: "var(--color-accent)" }}>
            Registrar pago
          </button>
        </form>
      )}

      {/* Transfer history */}
      <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
        <h2 className="font-semibold mb-3">Historial de pagos</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Sin pagos registrados</p>
        ) : (
          <div className="space-y-2">
            {transfers.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)]/50 last:border-0">
                <div>
                  <p className="text-sm">
                    {t.from_name} → {t.to_name}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">{t.description || t.type} · {t.date}</p>
                </div>
                <span className="text-sm font-medium">{formatMoney(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
