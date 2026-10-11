// Pipeline de importación de extractos bancarios (Excel/CSV/PDF).
// Extracción (Python) → identificación de campos con IA → vista previa → confirmación.

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import db, { createTransaction } from "@/lib/db";
import { callLLM, extractJSON } from "@/lib/llm";

const execFileAsync = promisify(execFile);
const PROJECT_DIR = process.cwd();
const IMPORTS_DIR = path.join(PROJECT_DIR, "data", "imports");
const VENV_PYTHON = process.env.OCR_VENV_PYTHON || "/home/ubuntu/ocr-venv/bin/python3";
const EXTRACT_SCRIPT = path.join(PROJECT_DIR, "lib", "import_extract.py");

export interface ImportRow {
  date: string | null; // YYYY-MM-DD
  description: string;
  amount: number | null; // signo banco: negativo = gasto
  category: string | null;
  include: boolean;
  note?: string | null;
  duplicate?: boolean;
}

export interface ImportJob {
  id: string;
  filename: string;
  stored_path: string;
  created_at: string;
  status: "preview" | "done";
  source: "table" | "lines";
  rows: ImportRow[];
  stats: { total: number; parsed: number; duplicates: number; unparsed: number; included: number };
  mapping?: unknown;
  result?: { imported: number; categories_created: string[]; confirmed_at: string; user_id: number; type: string; ids: number[] };
  error?: string | null;
}

// ─── Almacenamiento ────────────────────────────────────────────────────
function ensureDirs() {
  fs.mkdirSync(IMPORTS_DIR, { recursive: true });
}
export function jobPath(id: string) {
  return path.join(IMPORTS_DIR, `${id}.json`);
}
export function loadJob(id: string): ImportJob | null {
  try {
    if (!/^[a-f0-9-]{8,}$/i.test(id)) return null;
    return JSON.parse(fs.readFileSync(jobPath(id), "utf-8"));
  } catch {
    return null;
  }
}
function saveJob(job: ImportJob) {
  ensureDirs();
  fs.writeFileSync(jobPath(job.id), JSON.stringify(job, null, 1));
}

// ─── Extracción ────────────────────────────────────────────────────────
async function runExtract(filePath: string): Promise<any> {
  const py = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";
  try {
    const { stdout } = await execFileAsync(py, [EXTRACT_SCRIPT, filePath], {
      timeout: 120000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const out = (stdout || "").trim();
    if (!out) throw new Error("La extracción no devolvió datos");
    return JSON.parse(out);
  } catch (e: any) {
    // Fallos controlados: el script imprime {"error": "..."} en stdout
    const m = String(e?.stdout || "").match(/\{"error"[^}]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (parsed.error) throw new Error(parsed.error);
      } catch (e2) {
        if (e2 instanceof Error && e2.message && !e2.message.startsWith("{")) throw e2;
      }
    }
    const stderrLines = String(e?.stderr || "").trim().split("\n").filter(Boolean);
    const last = stderrLines[stderrLines.length - 1] || e?.message || "error desconocido";
    throw new Error(`No se pudo leer el archivo: ${last.slice(0, 180)}`);
  }
}

// ─── Parseo de importes y fechas ───────────────────────────────────────
export function parseAmount(v: any, mode: "es" | "en" | "auto" = "auto"): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[\s\u00A0€$£]/g, "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (mode === "en") {
    s = s.replace(/,/g, "");
  } else {
    // es | auto: coma decimal; puntos como separador de miles salvo caso decimal claro
    if (hasComma) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (hasDot) {
      const parts = s.split(".");
      const last = parts[parts.length - 1];
      const isDecimal = parts.length === 2 && last.length !== 3;
      if (!isDecimal) s = s.replace(/\./g, "");
    }
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseDate(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  let s = String(v).trim();
  if (!s) return null;
  s = s.split(" ")[0];
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    let y = m[3];
    if (y.length === 2) y = (parseInt(y, 10) > 70 ? "19" : "20") + y;
    if (mo > 12 && d <= 12) {
      const t = d;
      d = mo;
      mo = t;
    }
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const months: Record<string, number> = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
    jan: 1, apr: 4, aug: 8, dec: 12,
  };
  m = s.toLowerCase().match(/^(\d{1,2})[-\s]([a-záéíóú]{3})[a-z]*[-\s](\d{2,4})$/);
  if (m) {
    const mo2 = months[m[2].slice(0, 3)];
    if (mo2) {
      const y2 = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${y2}-${String(mo2).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

// ─── IA: mapeo de columnas (Excel/CSV) ─────────────────────────────────
const SYS_MAP = `Eres un experto en extractos bancarios españoles. Recibes las cabeceras y una muestra de filas de un archivo (Excel/CSV) y devuelves SOLO un objeto JSON con el mapeo de columnas. Reglas:
- Elige las columnas por su CONTENIDO real, no solo por el nombre.
- "desc_cols": lista de índices (0-based) de las columnas de texto que juntas forman la descripción (concepto, detalle, comercio...). Puede ser una o varias.
- Importe: o "amount_col" (una columna con el importe, con signo o mezclando gastos e ingresos) o "debit_col"/"credit_col" (cargo y abono separados).
- "amount_decimal": "es" si los importes usan coma decimal (1.234,56), "en" si usan punto (1,234.56).
- "sign": "negative_expense" si los gastos ya vienen en negativo; "positive_expense" si vienen en positivo.
- "date_format": formato de fecha observado, p.ej. "DD/MM/YYYY".
- Campos que no existan: null. Responde SOLO JSON, sin texto extra. Ejemplo:
{"date_col":0,"date_format":"DD/MM/YYYY","desc_cols":[2],"amount_col":3,"debit_col":null,"credit_col":null,"amount_decimal":"es","sign":"negative_expense","notes":"..."}`;

interface Mapping {
  date_col: number | null;
  date_format?: string | null;
  desc_cols: number[];
  amount_col: number | null;
  debit_col: number | null;
  credit_col: number | null;
  amount_decimal?: "es" | "en" | null;
  sign?: "negative_expense" | "positive_expense" | null;
  notes?: string;
}

async function mapColumns(headers: string[], rows: any[][]): Promise<Mapping> {
  const sample = rows.slice(0, 40);
  const user = `CABECERAS (índices 0-based):\n${JSON.stringify(headers)}\n\nMUESTRA (${sample.length} de ${rows.length} filas):\n${JSON.stringify(sample)}`;
  const resp = await callLLM(SYS_MAP, user, { maxTokens: 1500 });
  const m = extractJSON<Mapping>(resp);
  if (!Array.isArray(m.desc_cols)) m.desc_cols = m.desc_cols ? [m.desc_cols as any] : [];
  return m;
}

function applyMapping(rows: any[][], m: Mapping): ImportRow[] {
  const out: ImportRow[] = [];
  const dec = (m.amount_decimal as "es" | "en") || "auto";
  for (const r of rows) {
    const date = m.date_col != null ? parseDate(r[m.date_col]) : null;
    let amount: number | null = null;
    if (m.amount_col != null) {
      amount = parseAmount(r[m.amount_col], dec as any);
    } else if (m.debit_col != null || m.credit_col != null) {
      const deb = m.debit_col != null ? parseAmount(r[m.debit_col], dec as any) : null;
      const cre = m.credit_col != null ? parseAmount(r[m.credit_col], dec as any) : null;
      if (deb != null && deb !== 0) amount = -Math.abs(deb);
      else if (cre != null && cre !== 0) amount = Math.abs(cre);
    }
    if (amount != null && m.sign === "positive_expense") amount = -amount;
    const description = (m.desc_cols || [])
      .map((i) => String(r[i] ?? "").trim())
      .filter(Boolean)
      .join(" · ");
    if (!description && !date && amount == null) continue; // fila vacía
    out.push({ date, description, amount, category: null, include: true, note: null });
  }
  return out;
}

// ─── IA: normalización de líneas (PDF) ─────────────────────────────────
const SYS_LINES = `Eres un experto interpretando extractos bancarios españoles. Recibes líneas de texto (de un PDF) y devuelves SOLO un JSON con los movimientos.
Formato exacto: {"rows":[{"date":"YYYY-MM-DD","description":"texto","amount":-45.2,"include":true,"note":null}]}
Reglas:
- amount: número con punto decimal. Gastos NEGATIVOS, ingresos positivos.
- date: fecha del movimiento en formato YYYY-MM-DD (en el texto suele venir DD/MM/YYYY; asume día/mes/año).
- Si una línea continúa la descripción de la anterior (texto partido), únela al movimiento anterior en vez de crear otro.
- Cabeceras, totales, saldos, publicidad y ruido → include:false con note explicando.
- description: limpia y compacta (máx 120 caracteres).
- Si no puedes leer un importe con seguridad, amount:null.
Responde SOLO el JSON.`;

async function normalizeLines(lines: string[]): Promise<ImportRow[]> {
  const BATCH = 70;
  const out: ImportRow[] = [];
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    const user =
      `LÍNEAS (${i + 1}-${i + chunk.length} de ${lines.length}):\n` +
      chunk.map((l, j) => `${i + j + 1}) ${l}`).join("\n");
    const resp = await callLLM(SYS_LINES, user, { maxTokens: 4096 });
    const parsed = extractJSON<{ rows: any[] }>(resp);
    for (const r of parsed.rows || []) {
      const date = parseDate(r.date);
      const amount = typeof r.amount === "number" ? r.amount : parseAmount(r.amount);
      out.push({
        date,
        description: String(r.description || "").slice(0, 200),
        amount,
        category: null,
        include: r.include !== false,
        note: r.note || null,
      });
    }
  }
  return out;
}

// ─── Validación + duplicados + categorías ──────────────────────────────
function validateRows(rows: ImportRow[]): void {
  for (const r of rows) {
    if (r.amount == null) {
      r.include = false;
      r.note = r.note || "importe no reconocido";
    } else if (!r.date) {
      r.include = false;
      r.note = r.note || "sin fecha";
    } else if (r.amount > 0) {
      // Tras normalizar el signo, positivo = ingreso. La app solo registra gastos.
      r.include = false;
      r.note = r.note || "ingreso — no se importa (la app registra gastos)";
    }
  }
}

function normDesc(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(" ").filter((w) => w.length > 2));
  const tb = new Set(b.split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  ta.forEach((w) => {
    if (tb.has(w)) inter++;
  });
  return inter / Math.min(ta.size, tb.size) >= 0.6;
}

function flagDuplicates(rows: ImportRow[]): number {
  const existing = db.prepare("SELECT date, amount, description FROM transactions").all() as any[];
  const ex = existing.map((e) => ({
    date: String(e.date),
    amt: Math.abs(Number(e.amount)),
    d: normDesc(String(e.description || "")),
  }));
  const seen: { date: string | null; amt: number; d: string }[] = [];
  let dups = 0;
  for (const r of rows) {
    if (r.amount == null) continue;
    const amt = Math.abs(r.amount);
    const d = normDesc(r.description);
    const hit =
      ex.some((e) => e.date === r.date && Math.abs(e.amt - amt) < 0.005 && similar(e.d, d)) ||
      seen.some((e) => e.date === r.date && Math.abs(e.amt - amt) < 0.005 && similar(e.d, d));
    if (hit) {
      r.duplicate = true;
      r.include = false;
      r.note = r.note || "posible duplicado";
      dups++;
    }
    seen.push({ date: r.date, amt, d });
  }
  return dups;
}

const SYS_CAT = `Eres un asistente que clasifica movimientos bancarios de una pareja en España. Devuelves SOLO JSON: {"asignaciones":[{"desc":"...","categoria":"..."}]}
- Usa una categoría existente de la lista si encaja.
- Si ninguna encaja, propone una NUEVA categoría corta en español (sin emojis, 1-2 palabras).
- Usa "Transferencias" para traspasos entre personas y "Ingresos" para nóminas o abonos.
- Si de verdad no sabes, categoria:null.`;

async function categorize(rows: ImportRow[]): Promise<void> {
  const cats = db.prepare("SELECT name FROM categories ORDER BY name").all() as { name: string }[];
  const uniq = Array.from(new Set(rows.filter((r) => r.include).map((r) => r.description).filter(Boolean)));
  if (!uniq.length) return;
  const capped = uniq.slice(0, 60);
  const user =
    `Categorías existentes: ${cats.map((c) => c.name).join(", ") || "(ninguna)"}\n\n` +
    `Descripciones:\n${capped.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;
  const resp = await callLLM(SYS_CAT, user, { maxTokens: 2000 });
  const parsed = extractJSON<{ asignaciones: { desc: string; categoria: string | null }[] }>(resp);
  const map = new Map<string, string | null>();
  for (const a of parsed.asignaciones || []) map.set(String(a.desc), a.categoria ?? null);
  for (const r of rows) {
    if (map.has(r.description)) r.category = map.get(r.description) || null;
  }
}

// ─── API principal ─────────────────────────────────────────────────────
export async function runImport(filePath: string, filename: string): Promise<ImportJob> {
  ensureDirs();
  const raw = await runExtract(filePath);
  if (raw.error) throw new Error(raw.error);
  if (raw.kind === "scanned") throw new Error(raw.hint || "El PDF parece escaneado (sin texto)");

  let rows: ImportRow[];
  let mapping: unknown = null;
  let source: "table" | "lines";
  if (raw.kind === "table") {
    source = "table";
    const headers: string[] = raw.headers || [];
    const dataRows: any[][] = raw.rows || [];
    if (!dataRows.length) throw new Error("No se detectaron filas de datos");
    mapping = await mapColumns(headers, dataRows);
    rows = applyMapping(dataRows, mapping as Mapping);
  } else {
    source = "lines";
    rows = await normalizeLines(raw.lines || []);
  }
  validateRows(rows);
  try {
    await categorize(rows);
  } catch {
    /* la categorización es opcional */
  }
  const duplicates = flagDuplicates(rows);
  const stats = {
    total: rows.length,
    parsed: rows.filter((r) => r.amount != null && r.date).length,
    duplicates,
    unparsed: rows.filter((r) => r.amount == null || !r.date).length,
    included: rows.filter((r) => r.include).length,
  };
  const job: ImportJob = {
    id: crypto.randomUUID(),
    filename,
    stored_path: filePath,
    created_at: new Date().toISOString(),
    status: "preview",
    source,
    rows,
    stats,
    mapping,
  };
  saveJob(job);
  return job;
}

export function confirmImport(
  id: string,
  opts: { rows?: ImportRow[]; user_id: number; type: "shared" | "private"; create_categories?: boolean }
): { imported: number; categories_created: string[]; import_id: string; ids: number[] } {
  const job = loadJob(id);
  if (!job) throw new Error("Importación no encontrada");
  if (job.status === "done") throw new Error("Esta importación ya se confirmó");
  const rows = (opts.rows && opts.rows.length ? opts.rows : job.rows).filter(
    (r) => r.include && r.amount != null && r.date
  );
  const cats = db.prepare("SELECT id, name FROM categories").all() as { id: number; name: string }[];
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const created: string[] = [];
  const ids: number[] = [];
  const insertAll = db.transaction(() => {
    for (const r of rows) {
      let category_id: number | undefined;
      if (r.category) {
        const key = r.category.toLowerCase();
        if (byName.has(key)) {
          category_id = byName.get(key);
        } else if (opts.create_categories) {
          const info = db
            .prepare("INSERT INTO categories (name, type, icon, color, user_id) VALUES (?, 'shared', '🏷️', '#6b7280', NULL)")
            .run(r.category);
          category_id = Number(info.lastInsertRowid);
          byName.set(key, category_id);
          created.push(r.category);
        }
      }
      const newId = createTransaction({
        user_id: opts.user_id,
        type: opts.type,
        amount: Math.abs(r.amount as number),
        description: r.description || "",
        date: r.date as string,
        category_id,
      });
      ids.push(newId);
    }
  });
  insertAll();
  job.status = "done";
  job.result = {
    imported: ids.length,
    categories_created: created,
    confirmed_at: new Date().toISOString(),
    user_id: opts.user_id,
    type: opts.type,
    ids,
  };
  saveJob(job);
  return { imported: ids.length, categories_created: created, import_id: id, ids };
}
