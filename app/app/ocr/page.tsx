"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function OcrPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ocr", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error del servidor");
        setLoading(false);
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Error de conexión");
    }
    setLoading(false);
  };

  // After OCR result, create transaction
  const handleCreateTransaction = async (type: "shared" | "private") => {
    if (!result) return;
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        amount: result.total || 0,
        description: result.proveedor || "Factura OCR",
        date: result.fecha || new Date().toISOString().split("T")[0],
        invoice_id: result.id,
      }),
    });
    const data = await res.json();
    if (data.success) {
      router.push("/app/transactions");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📄 OCR Factura</h1>
          <p className="text-[var(--color-text-muted)] text-sm">Sube una foto de tu factura o ticket</p>
        </div>
        <Link href="/app/transactions" className="text-sm text-[var(--color-accent)] hover:underline">
          ← Ver gastos
        </Link>
      </div>

      {/* Upload */}
      {!result && (
        <div
          className="drop-zone p-8 text-center mb-6"
          onClick={() => document.getElementById("ocr-file-input")?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("dragover"); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <input id="ocr-file-input" type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {preview ? (
            <div className="space-y-4">
              <img src={preview} alt="Preview" className="max-h-60 mx-auto rounded-lg object-contain" />
              <p className="text-sm text-[var(--color-text-muted)]">{file?.name}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-5xl">📸</div>
              <p className="text-lg font-medium">Arrastra una factura aquí</p>
              <p className="text-sm text-[var(--color-text-muted)]">o haz clic para seleccionar</p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {file && !result && !loading && (
        <button onClick={handleUpload}
          className="w-full py-3 rounded-lg text-white font-medium"
          style={{ background: "linear-gradient(135deg, var(--color-accent), #0d9270)" }}>
          🚀 Procesar factura
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)]">
          <div className="spinner w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
          <span className="text-sm">Procesando imagen + IA…</span>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-900/20 border border-red-800/50">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* OCR Result */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
            <h2 className="font-semibold mb-3">📊 Datos extraídos</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-[var(--color-text-muted)]">Proveedor:</span> {result.proveedor || "—"}</div>
              <div><span className="text-[var(--color-text-muted)]">CIF:</span> {result.cif_nif || "—"}</div>
              <div><span className="text-[var(--color-text-muted)]">Fecha:</span> {result.fecha || "—"}</div>
              <div><span className="text-[var(--color-text-muted)]">Nº Factura:</span> {result.numero_factura || "—"}</div>
              <div><span className="text-[var(--color-text-muted)]">Total:</span> <strong className="text-[var(--color-accent)]">{result.total ? `${result.total.toFixed(2)} €` : "—"}</strong></div>
              <div><span className="text-[var(--color-text-muted)]">IVA:</span> {result.iva ? `${result.iva.toFixed(2)} €` : "—"}</div>
            </div>
          </div>

          {/* Lines */}
          {result.lineas?.length > 0 && (
            <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
              <h3 className="font-medium mb-2">🧾 Líneas</h3>
              {result.lineas.map((l: any, i: number) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-[var(--color-border)]/50 last:border-0">
                  <span>{l.descripcion}</span>
                  <span>{l.importe?.toFixed(2)} €</span>
                </div>
              ))}
            </div>
          )}

          {/* Create transaction */}
          <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
            <h3 className="font-medium mb-3">➕ Crear gasto desde esta factura</h3>
            <div className="flex gap-3">
              <button onClick={() => handleCreateTransaction("shared")}
                className="flex-1 py-3 rounded-lg text-white text-sm font-medium"
                style={{ background: "var(--color-accent)" }}>
                Compartido (50/50)
              </button>
              <button onClick={() => handleCreateTransaction("private")}
                className="flex-1 py-3 rounded-lg text-white text-sm font-medium"
                style={{ background: "#6366f1" }}>
                Privado
              </button>
            </div>
          </div>

          <button onClick={() => { setResult(null); setFile(null); setPreview(null); }}
            className="w-full py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)]">
            Nueva factura
          </button>
        </div>
      )}
    </div>
  );
}
