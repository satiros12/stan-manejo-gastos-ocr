"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const load = async () => {
    const res = await fetch("/api/groups?_action=my-groups");
    const data = await res.json();
    setGroups(data.groups || []);

    if (data.defaultGroup) {
      const detailRes = await fetch(`/api/groups?_action=group-detail&id=${data.defaultGroup.id}`);
      const detail = await detailRes.json();
      setSelectedGroup(detail.group);
      setMembers(detail.members || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
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

  const handleRegenerate = async () => {
    if (!selectedGroup) return;
    const res = await fetch(`/api/groups?_action=regenerate-invite&id=${selectedGroup.id}`, { method: "POST" });
    const data = await res.json();
    if (data.invite_code) {
      setSelectedGroup({ ...selectedGroup, invite_code: data.invite_code });
    }
  };

  const copyInvite = () => {
    if (!selectedGroup?.invite_code) return;
    const link = `${window.location.origin}/invite/${selectedGroup.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = async () => {
    if (!selectedGroup?.invite_code) return;
    const link = `${window.location.origin}/invite/${selectedGroup.invite_code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Invitación al grupo", text: "Únete a mi grupo de gestión económica", url: link }); } catch {}
    } else {
      copyInvite();
    }
  };

  if (loading) return <div className="text-center py-12 text-[var(--color-text-muted)]">Cargando…</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">⚙️ Configuración</h1>

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

      {/* ─── Group ───────────────────────────────────────────────── */}
      {selectedGroup && (
        <>
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6">
            <h2 className="font-semibold mb-3">🏠 {selectedGroup.name}</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1.5">Enlace de invitación</label>
                <div className="flex gap-2">
                  <input readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${selectedGroup.invite_code}`}
                    className="flex-1 p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-xs font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button onClick={copyInvite}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: copied ? "var(--color-accent)" : "#6366f1" }}>
                    {copied ? "✅" : "📋"}
                  </button>
                  <button onClick={handleShare}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: "#0f8a5f" }}>
                    📤
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Comparte este enlace para invitar a más miembros al grupo
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={handleRegenerate}
                  className="px-3 py-2 rounded-lg text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white transition-colors">
                  🔄 Regenerar código
                </button>
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 mb-6">
            <h2 className="font-semibold mb-3">👥 Miembros ({members.length})</h2>
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)]/50 last:border-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ background: m.user_color || "#6b7280" }}>
                    {m.user_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.user_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{m.user_email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.role === "admin" ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10" : "text-[var(--color-text-muted)] bg-white/5"}`}>
                    {m.role === "admin" ? "Admin" : "Miembro"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
