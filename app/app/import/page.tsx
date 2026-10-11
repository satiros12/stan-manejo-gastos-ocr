"use client";

// Importar extracto bancario (Excel/CSV/PDF): subir → IA identifica campos → revisar → importar.

import { useSession } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface ImportRow {
  date: string | null;
  description: string;
  amount: number | null; // signo banco: negativo = gasto
  category: string | null;
  include: boolean;
  note?: string | null;
  duplicate?: boolean;
}

interface ImportJob {
  id: string;
  filename: string;
  status: string;
  source: string;
  rows: ImportRow[];
  stats: { total: number; parsed: number; duplicates: number; unparsed: number; included: number };
  result?: { imported: number; categories_created: string[] } | null;
}

interface Category {
  id: number;
  name: string;
  icon: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  color: string;
}

const STEPS = ["Subiendo archivo", "Extrayendo datos", "Identificando campos con IA"];

function ImportInner() {
  const { data: session } = useSession();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"idle" | "working" | "preview" | "done">("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [titular, setTitular] = useState("");
  const [tipo, setTipo] = useState<"shared" | "private">("shared");
  const [crearCats, setCrearCats] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ imported: number; categories_created: string[] } | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    setTitular((t) => t || session.user!.id!);
    Promise.all([
      fetch("/api/data?_resource=users").then((r) => r.json()),
      fetch("/api/data?_resource=categories").then((r) => r.json()),
    ])
      .then(([u, c]) => {
        setUsers(u.users || []);
        setCats(c.categories || []);
      })
      .catch(() => {});
  }, [session]);

  // Cargar una vista previa existente por URL (?id=...) — útil también cuando la crea el agente
  useEffect(() => {
    const id = params.get("id");
    if (!id || !session?.user?.id) return;
    fetch(`/api/import?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.import) {
          setJob(d.import);
          setRows((d.import.rows || []).map((r: ImportRow) => ({ ...r })));
          if (d.import.status === "done") {
            setResult(d.import.result || null);
            setStage("done");
          } else {
            setStage("preview");
          }
        } else {
          setError(d.error || "Importación no encontrada");
        }
      })
      .catch(() => setError("No se pudo cargar la importación"));
  }, [params, session]);

  const reset = () => {
    setStage("idle");
    setJob(null);
    setRows([]);
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleAnalyze = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setError("Elige un archivo primero");
      return;
    }
    setError("");
    setStage("working");
    setStepIdx(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStepIdx(1), 700));
    timers.push(setTimeout(() => setStepIdx(2), 2600));
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error procesando el archivo");
      setStepIdx(3);
      setJob(data.import);
      setRows((data.import.rows || []).map((r: ImportRow) => ({ ...r })));
      setTimeout(() => setStage("preview"), 350);
    } catch (e: any) {
      const msg =
        e?.message === "Failed to fetch"
          ? "No se pudo conectar con el servidor; inténtalo de nuevo."
          : e?.message || "Error procesando el archivo";
      setError(msg);
      setStage("idle");
    } finally {
      timers.forEach(clearTimeout);
    }
  };

  const updateRow = (i: number, patch: Partial<ImportRow>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const handleConfirm = async () => {
    if (!job) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.id,
          rows,
          user_id: parseInt(titular || session?.user?.id || "0"),
          type: tipo,
          create_categories: crearCats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error confirmando");
      setResult({ imported: data.imported, categories_created: data.categories_created || [] });
      setStage("done");
    } catch (e: any) {
      setError(e?.message || "Error confirmando la importación");
    } finally {
      setSaving(false);
    }
  };

  const includedCount = rows.filter((r) => r.include && r.amount != null && r.date).length;
  const newCats = Array.from(
    new Set(
      rows
        .map((r) => r.category)
        .filter((c): c is string => !!c && !cats.some((cc) => cc.name.toLowerCase() === c.toLowerCase()))
    )
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Importar extracto</h1>
        <p className="text-[var(--color-text-muted)] text-sm">
          Sube el Excel, CSV o PDF del banco; la IA identifica las columnas y tú revisas antes de importar
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-sm p-3 mb-4">{error}</div>
      )}

      {/* Paso 1: elegir archivo */}
      {stage === "idle" && (
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
          <label className="drop-zone block p-8 text-center mb-4">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt,.pdf"
              className="hidden"
              onChange={() => setError("")}
            />
            <div className="text-3xl mb-2">📥</div>
            <p className="text-sm font-medium">Elige el extracto del banco</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Excel (.xlsx), CSV o PDF · máx 20 MB</p>
          </label>
          <button
            onClick={handleAnalyze}
            className="w-full py-3 rounded-lg text-white font-medium text-base"
            style={{ background: "var(--color-accent)" }}
          >
            Analizar archivo
          </button>
          <p className="text-xs text-[var(--color-text-muted)] mt-3">
            Nada se importa hasta que tú lo confirmes: primero verás una vista previa de todos los movimientos
            detectados, con los posibles duplicados ya marcados.
          </p>
        </div>
      )}

      {/* Progreso */}
      {stage === "working" && (
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-3 py-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  i < stepIdx
                    ? "bg-[var(--color-accent)] text-white"
                    : i === stepIdx
                      ? "border-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span className={`text-sm ${i <= stepIdx ? "" : "text-[var(--color-text-muted)]"}`}>
                {s}
                {i === stepIdx && (
                  <span className="spinner inline-block w-3 h-3 ml-2 border border-[var(--color-accent)] border-t-transparent rounded-full align-middle" />
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Vista previa */}
      {(stage === "preview" || stage === "done") && job && (
        <>
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 mb-4">
            <p className="text-sm font-medium mb-1 truncate">📄 {job.filename}</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {job.stats.total} movimientos detectados · {job.stats.duplicates} posibles duplicados ·{" "}
              {job.stats.unparsed} sin interpretar
            </p>
          </div>

          {stage === "preview" && (
            <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">Titular</label>
                <select
                  value={titular}
                  onChange={(e) => setTitular(e.target.value)}
                  className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">Tipo</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as "shared" | "private")}
                  className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm"
                >
                  <option value="shared">Compartido (50/50)</option>
                  <option value="private">Privado (solo titular)</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={crearCats}
                    onChange={(e) => setCrearCats(e.target.checked)}
                    className="w-4 h-4 accent-[var(--color-accent)]"
                  />
                  Crear categorías sugeridas
                </label>
              </div>
            </div>
          )}

          <div className="space-y-2 pb-24">
            {rows.map((r, i) => (
              <RowCard key={i} row={r} cats={cats.map((c) => c.name)} newCats={newCats} disabled={stage === "done"} onChange={(p) => updateRow(i, p)} />
            ))}
          </div>

          {stage === "preview" && (
            <div className="sticky bottom-4 mt-6">
              <button
                onClick={handleConfirm}
                disabled={saving || includedCount === 0}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-base shadow-lg disabled:opacity-60"
                style={{ background: "var(--color-accent)" }}
              >
                {saving ? "Importando…" : `Importar ${includedCount} gasto${includedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Resultado */}
      {stage === "done" && (
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 text-center mt-6">
          <div className="text-3xl mb-2">✅</div>
          <p className="font-semibold mb-1">
            {result?.imported ?? 0} gasto{(result?.imported ?? 0) === 1 ? "" : "s"} importado
            {(result?.imported ?? 0) === 1 ? "" : "s"}
          </p>
          {!!result?.categories_created?.length && (
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              Categorías nuevas: {result.categories_created.join(", ")}
            </p>
          )}
          <div className="flex gap-3 justify-center mt-4">
            <Link
              href="/app/transactions"
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: "var(--color-accent)" }}
            >
              Ver gastos
            </Link>
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-muted)] border border-[var(--color-border)]"
            >
              Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowCard({
  row,
  cats,
  newCats,
  disabled,
  onChange,
}: {
  row: ImportRow;
  cats: string[];
  newCats: string[];
  disabled: boolean;
  onChange: (p: Partial<ImportRow>) => void;
}) {
  const isNew = !!row.category && newCats.includes(row.category);
  return (
    <div
      className={`rounded-xl border p-3 ${
        row.duplicate ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--color-border)] bg-[var(--color-bg-card)]"
      } ${!row.include ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={row.include}
          disabled={disabled}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-2 w-5 h-5 flex-shrink-0 accent-[var(--color-accent)]"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <input
            type="text"
            value={row.description}
            disabled={disabled}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Descripción"
            className="w-full p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm"
          />
          <div className="grid grid-cols-2 sm:grid-cols-[130px_120px_1fr] gap-2">
            <input
              type="date"
              value={row.date || ""}
              disabled={disabled}
              onChange={(e) => onChange({ date: e.target.value })}
              className="p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={row.amount == null ? "" : Math.abs(row.amount)}
              disabled={disabled}
              onChange={(e) => onChange({ amount: e.target.value === "" ? null : -Math.abs(parseFloat(e.target.value)) })}
              placeholder="€"
              className="p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm"
            />
            <select
              value={row.category || ""}
              disabled={disabled}
              onChange={(e) => onChange({ category: e.target.value || null })}
              className="p-2 rounded-lg bg-[var(--color-bg-input)] border border-[var(--color-border)] text-sm col-span-2 sm:col-span-1"
            >
              <option value="">Sin categoría</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {isNew && <option value={row.category!}>{row.category} (nueva)</option>}
            </select>
          </div>
          {(row.note || row.duplicate) && (
            <p className="text-xs" style={{ color: row.duplicate ? "#f59e0b" : "var(--color-text-muted)" }}>
              {row.duplicate ? "⚠ " : ""}
              {row.note || ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-[var(--color-text-muted)]">Cargando…</div>}>
      <ImportInner />
    </Suspense>
  );
}
