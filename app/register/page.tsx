"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Error al registrar");
      setLoading(false);
      return;
    }

    // Auto-login after register
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.ok) {
      router.push("/app/dashboard");
      router.refresh();
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">💰 Gestión en Pareja</h1>
          <p className="text-[var(--color-text-muted)] mt-2">Crear cuenta</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Máximo 2 usuarios (tú y tu pareja)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full p-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={4}
            className="w-full p-3 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
          />

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-medium text-white transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--color-accent), #0d9270)" }}
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-[var(--color-accent)] hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
