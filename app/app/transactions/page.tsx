"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface Transaction {
  id: number;
  user_id: number;
  category_id: number | null;
  type: "shared" | "private";
  amount: number;
  split_ratio: number;
  description: string;
  date: string;
  invoice_id: number | null;
  user_name?: string;
  category_name?: string;
  category_icon?: string;
}

interface Category {
  id: number;
  name: string;
  type: "shared" | "private";
  icon: string;
  color: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  color: string;
}

const EMPTY_FORM = {
  type: "shared" as "shared" | "private",
  category_id: "",
  amount: "",
  description: "",
  date: new Date().toISOString().split("T")[0],
  split_ratio: "0.5",
};

export default function TransactionsPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "shared" | "private">("all");
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const userId = parseInt(session?.user?.id || "0");

  const loadData = async () => {
    const [txRes, catRes, userRes] = await Promise.all([
      fetch("/api/data"),
      fetch("/api/data?_resource=categories"),
      fetch("/api/data?_resource=users"),
    ]);
    setTransactions((await txRes.json()).transactions || []);
    setCategories((await catRes.json()).categories || []);
    setUsers((await userRes.json()).users || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split("T")[0] });
    setShowForm(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      category_id: tx.category_id ? String(tx.category_id) : "",
      amount: String(tx.amount),
      description: tx.description || "",
      date: tx.date,
      split_ratio: String(tx.split_ratio),
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      category_id: form.category_id ? parseInt(form.category_id) : undefined,
      amount: parseFloat(form.amount),
      split_ratio: form.type === "private" ? 1 : parseFloat(form.split_ratio),
    };

    if (editingId) {
      await fetch(`/api/data?_resource=transaction&id=${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    loadData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    await fetch(`/api/data?id=${id}`, { method: "DELETE" });
    loadData();
  };

  const filtered = filter === "all" ? transactions : transactions.filter(t => t.type === filter);
  const formatMoney = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gastos</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Registra y gestiona tus gastos</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: "var(--color-accent)" }}>
          + Nuevo gasto
        </button>
      </div>

      {/* Form (create / edit) */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6 space-y-4">
          <p className="text-sm font-medium">{editingId ? "✏️ Editar gasto" : "➕ Nuevo gasto"}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any, split_ratio: e.target.value === "private" ? "1" : form.split_ratio })}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm">
                <option value="shared">Compartido (50/50)</option>
                <option value="private">Privado (solo yo)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Categoría</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm">
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
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
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">
              Descripción <span className="text-[var(--color-text-muted)]/50">(opcional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Ej: Compra semanal en Mercadona, Cena en restaurante, etc."
              rows={2}
              className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button type="submit"
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: "var(--color-accent)" }}>
              {editingId ? "Guardar cambios" : "Crear gasto"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-muted)] border border-[var(--color-border)]">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(["all", "shared", "private"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? "text-white" : "text-[var(--color-text-muted)] bg-[var(--color-bg-card)] border border-[var(--color-border)]"}`}
            style={filter === f ? { background: "var(--color-accent)" } : {}}>
            {f === "all" ? "Todos" : f === "shared" ? "Compartidos" : "Privados"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-8 text-[var(--color-text-muted)]">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-8 text-[var(--color-text-muted)]">Sin gastos registrados</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <div key={t.id} className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t.category_icon || "💳"}</span>
                    <span className="text-sm font-medium truncate">{t.description || t.category_name || "Gasto"}</span>
                  </div>
                  {t.description && t.category_name && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{t.category_icon} {t.category_name}</p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {t.user_name} · {t.type === "shared" ? "Compartido" : "Privado"} · {t.date}
                  </p>
                </div>
                <div className="text-right ml-3 flex-shrink-0">
                  <p className="text-sm font-medium">{formatMoney(t.amount)}</p>
                  {t.type === "shared" && (
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {t.user_id === userId
                        ? `Te deben ${formatMoney(t.amount * (1 - t.split_ratio))}`
                        : `Debes ${formatMoney(t.amount * t.split_ratio)}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-2 border-t border-[var(--color-border)]/50 pt-2">
                <button onClick={() => openEdit(t)}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
                  ✏️ Editar
                </button>
                <button onClick={() => handleDelete(t.id)}
                  className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors">
                  🗑️ Eliminar
                </button>
                {t.invoice_id && (
                  <span className="text-xs text-[var(--color-text-muted)]/50">📄 OCR</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
