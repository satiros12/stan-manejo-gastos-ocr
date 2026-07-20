"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function InvitePage() {
  const params = useParams();
  const code = params.code as string;
  const [group, setGroup] = useState<{ id: number; name: string; member_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/groups?_action=check-invite&code=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) setGroup(d.group);
        else setError(d.error || "Código inválido");
      })
      .catch(() => setError("Error al verificar código"))
      .finally(() => setLoading(false));
  }, [code]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setError("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, inviteCode: code }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Error al registrarse");
      setRegistering(false);
      return;
    }

    setSuccess(true);
    // Auto-login
    const { signIn } = await import("next-auth/react");
    await signIn("credentials", { email, password, redirect: true, callbackUrl: "/app/dashboard" });
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <p className="text-[var(--color-text-muted)]">Verificando invitación…</p>
      </main>
    );
  }

  if (error && !group) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-xl font-bold mb-2">Invitación no válida</h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">{error}</p>
          <Link href="/register" className="text-[var(--color-accent)] hover:underline text-sm">
            Ir a registro →
          </Link>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold mb-2">¡Registrado!</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Te has unido a <strong>{group?.name}</strong></p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏠</div>
          <h1 className="text-2xl font-bold">Te han invitado a</h1>
          <p className="text-lg text-[var(--color-accent)] font-medium mt-1">{group?.name}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {group?.member_count || 1} miembro(s) en el grupo
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text" placeholder="Tu nombre" required
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="email" placeholder="Email" required
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full p-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="password" placeholder="Contraseña" required minLength={4}
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full p-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={registering}
            className="w-full py-3 rounded-lg text-white font-medium transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--color-accent), #0d9270)" }}>
            {registering ? "Registrando…" : "Unirme al grupo"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-text-muted)] mt-4">
          Código: <code className="bg-[var(--color-bg-card)] px-2 py-0.5 rounded">{code}</code>
        </p>
      </div>
    </main>
  );
}
