"use client";

import { useEffect, useState } from "react";

interface Category {
  id: number;
  name: string;
  type: "shared" | "private";
  icon: string;
  color: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "shared" as "shared" | "private", icon: "📦", color: "#6b7280" });

  const load = async () => {
    const res = await fetch("/api/data?_resource=categories");
    const data = await res.json();
    setCategories(data.categories || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/data?_resource=categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ name: "", type: "shared", icon: "📦", color: "#6b7280" });
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    await fetch(`/api/data?_resource=categories&id=${id}`, { method: "DELETE" });
    load();
  };

  const ICONS = ["🍎", "🚗", "🏠", "💡", "📱", "👕", "🎮", "✈️", "💊", "📚", "🐾", "🎵", "☕", "🎂", "🔧", "📦"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Categorías</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: "var(--color-accent)" }}>
          + Nueva categoría
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Nombre</label>
              <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}
                className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm">
                <option value="shared">Compartida</option>
                <option value="private">Privada</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-text-muted)] block mb-1">Icono</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => setForm({ ...form, icon })}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg border ${form.icon === icon ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: "var(--color-accent)" }}>
            Crear categoría
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-center py-8 text-[var(--color-text-muted)]">Cargando…</p>
      ) : categories.length === 0 ? (
        <p className="text-center py-8 text-[var(--color-text-muted)]">Sin categorías. Crea tu primera categoría.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map(c => (
            <div key={c.id} className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{c.icon}</span>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{c.type === "shared" ? "Compartida" : "Privada"}</p>
                </div>
              </div>
              <button onClick={() => handleDelete(c.id)} className="text-[var(--color-text-muted)] hover:text-red-400 text-sm">🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
