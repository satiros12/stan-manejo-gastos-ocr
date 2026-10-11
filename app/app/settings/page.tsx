"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { data: session, update } = useSession();

  // Profile form
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState("");

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setNameMsg("");

    const res = await fetch("/api/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setNameMsg(data.message || data.error || "Error");
    if (res.ok) update();
    setSavingName(false);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPassMsg("Las contraseñas no coinciden");
      return;
    }
    setSavingPass(true);
    setPassMsg("");

    const res = await fetch("/api/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setPassMsg(data.message || data.error || "Error");
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPass(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">⚙️ Ajustes</h1>

      {/* Dos cuentas */}
      <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6">
        <h2 className="font-semibold mb-2">👫 Dos cuentas</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Esta app es para dos personas: tú y tu pareja, cada una con su propia cuenta. El registro
          se cierra automáticamente al crear la segunda cuenta.
        </p>
      </div>

      {/* ─── Profile ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6">
        <h2 className="font-semibold mb-3">👤 Mi perfil</h2>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">{session?.user?.email}</p>

        <form onSubmit={handleSaveName} className="mb-4">
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Nombre</label>
          <div className="flex gap-2">
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="flex-1 p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-accent)]" />
            <button type="submit" disabled={savingName || !name.trim()}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}>
              {savingName ? "…" : "Guardar"}
            </button>
          </div>
          {nameMsg && <p className={`text-xs mt-1 ${nameMsg.includes("actualizado") ? "text-[var(--color-accent)]" : "text-red-400"}`}>{nameMsg}</p>}
        </form>

        <form onSubmit={handleSavePassword}>
          <label className="text-xs text-[var(--color-text-muted)] block mb-1">Cambiar contraseña</label>
          <div className="space-y-2">
            <input type="password" placeholder="Contraseña actual" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} required
              className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-accent)]" />
            <div className="flex gap-2">
              <input type="password" placeholder="Nueva contraseña" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} required minLength={4}
                className="flex-1 p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-accent)]" />
              <input type="password" placeholder="Confirmar" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} required minLength={4}
                className="flex-1 p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-accent)]" />
            </div>
            <button type="submit" disabled={savingPass}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: "#6366f1" }}>
              {savingPass ? "…" : "Actualizar contraseña"}
            </button>
          </div>
          {passMsg && <p className={`text-xs mt-1 ${passMsg.includes("actualizada") ? "text-[var(--color-accent)]" : "text-red-400"}`}>{passMsg}</p>}
        </form>
      </div>
    </div>
  );
}
