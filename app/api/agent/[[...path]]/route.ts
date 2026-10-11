// API de agente — gestión directa de datos por parte de agentes/automatizaciones.
// Auth: Authorization: Bearer <AGENT_API_TOKEN>  o  X-Agent-Token: <token>.
// Diseñada para agentes SIN contexto: GET /api/agent (o /docs) devuelve documentación completa.

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import db, {
  getAllUsers,
  getUserById,
  getUserByEmail,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransaction,
  createCategory,
  deleteCategory,
  getTransfers,
  createTransfer,
  getBalance,
  getAllInvoices,
} from "@/lib/db";
import { agentAuthed } from "@/lib/agent-auth";
import { runImport, loadJob, confirmImport, parseAmount, parseDate } from "@/lib/import_pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FILES_DIR = path.join(process.cwd(), "data", "imports", "files");
const ALLOWED_EXT = [".xlsx", ".xlsm", ".csv", ".txt", ".pdf"];
const MAX_SIZE = 20 * 1024 * 1024;

class HttpError extends Error {
  status: number;
  hint?: string;
  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

function handleError(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message, ...(e.hint ? { hint: e.hint } : {}) }, e.status);
  const msg = e instanceof Error ? e.message : "error desconocido";
  console.error("agent api:", e);
  return json({ error: msg }, 500);
}

// ─── Helpers ───────────────────────────────────────────────────────────

function resolveUser(body: any): { id: number; name: string } | null {
  if (body.user_id) {
    const u = getUserById(parseInt(body.user_id));
    return u ? { id: u.id, name: u.name } : null;
  }
  if (body.user_email) {
    const u = getUserByEmail(String(body.user_email));
    return u ? { id: u.id, name: u.name } : null;
  }
  if (body.user_name) {
    const u = db.prepare("SELECT id, name FROM users WHERE lower(name)=lower(?)").get(String(body.user_name)) as any;
    return u ? { id: u.id, name: u.name } : null;
  }
  return null;
}

function createTxFromBody(body: any): { id: number; user: string } {
  const user = resolveUser(body);
  if (!user) throw new HttpError(400, "Indica user_id, user_email o user_name (y que exista)", "Usa GET /users para ver las cuentas.");
  const amount = typeof body.amount === "number" ? body.amount : parseAmount(body.amount);
  if (amount == null) throw new HttpError(400, "amount inválido");
  const type = body.type === "private" ? "private" : "shared";
  let category_id: number | undefined;
  if (body.category_id) category_id = parseInt(body.category_id);
  else if (body.category_name) {
    const row = db.prepare("SELECT id FROM categories WHERE lower(name)=lower(?)").get(String(body.category_name)) as any;
    if (row) category_id = row.id;
    else if (body.create_category) {
      const info = db
        .prepare("INSERT INTO categories (name, type, icon, color, user_id) VALUES (?, ?, '🏷️', '#6b7280', NULL)")
        .run(String(body.category_name), type === "private" ? "private" : "shared");
      category_id = Number(info.lastInsertRowid);
    }
  }
  const date = body.date ? parseDate(body.date) || String(body.date) : new Date().toISOString().slice(0, 10);
  const id = createTransaction({
    user_id: user.id,
    type,
    amount: Math.abs(amount),
    description: String(body.description || ""),
    date,
    category_id,
  });
  return { id, user: user.name };
}

function listTransactions(sp: URLSearchParams): any[] {
  let sql = `SELECT t.*, u.name as user_name, c.name as category_name, c.icon as category_icon
    FROM transactions t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE 1=1`;
  const p: any[] = [];
  if (sp.get("month")) { sql += " AND t.date LIKE ?"; p.push(sp.get("month") + "%"); }
  if (sp.get("from")) { sql += " AND t.date >= ?"; p.push(sp.get("from")); }
  if (sp.get("to")) { sql += " AND t.date <= ?"; p.push(sp.get("to")); }
  if (sp.get("type")) { sql += " AND t.type = ?"; p.push(sp.get("type")); }
  if (sp.get("user_id")) { sql += " AND t.user_id = ?"; p.push(parseInt(sp.get("user_id")!)); }
  if (sp.get("category_id")) { sql += " AND t.category_id = ?"; p.push(parseInt(sp.get("category_id")!)); }
  if (sp.get("q")) {
    sql += " AND (t.description LIKE ? OR c.name LIKE ?)";
    p.push(`%${sp.get("q")}%`, `%${sp.get("q")}%`);
  }
  sql += " ORDER BY t.date DESC, t.id DESC LIMIT ?";
  p.push(sp.get("limit") ? Math.min(parseInt(sp.get("limit")!), 1000) : 200);
  if (sp.get("offset")) { sql += " OFFSET ?"; p.push(parseInt(sp.get("offset")!)); }
  return db.prepare(sql).all(...p) as any[];
}

function overview() {
  const users = getAllUsers().map((u) => ({ id: u.id, name: u.name, email: u.email, color: u.color }));
  const counts = {
    transactions: (db.prepare("SELECT COUNT(*) c FROM transactions").get() as any).c,
    categories: (db.prepare("SELECT COUNT(*) c FROM categories").get() as any).c,
    invoices: (db.prepare("SELECT COUNT(*) c FROM invoices").get() as any).c,
    transfers: (db.prepare("SELECT COUNT(*) c FROM transfers").get() as any).c,
  };
  const month = new Date().toISOString().slice(0, 7);
  const monthStats = db
    .prepare("SELECT type, ROUND(SUM(amount),2) total, COUNT(*) n FROM transactions WHERE date LIKE ? GROUP BY type")
    .all(month + "%");
  const recent = db
    .prepare(
      `SELECT t.id, t.date, t.amount, t.type, t.description, u.name user_name
       FROM transactions t LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.date DESC, t.id DESC LIMIT 10`
    )
    .all();
  return { users, counts, month, month_stats: monthStats, recent };
}

function balanceInfo() {
  const users = getAllUsers();
  if (users.length < 2) return { users: users.map((u) => u.name), balance: null, note: "Se necesitan dos cuentas registradas" };
  const [a, b] = users;
  const month = new Date().toISOString().slice(0, 7);
  const paidA = (db.prepare("SELECT COALESCE(SUM(amount),0) t FROM transactions WHERE type='shared' AND user_id=? AND date LIKE ?").get(a.id, month + "%") as any).t;
  const paidB = (db.prepare("SELECT COALESCE(SUM(amount),0) t FROM transactions WHERE type='shared' AND user_id=? AND date LIKE ?").get(b.id, month + "%") as any).t;
  const monthSettlement = paidB * 0.5 - paidA * 0.5;
  const transfersNet = getBalance(a.id, b.id);
  return {
    month,
    users: [a.name, b.name],
    month_shared_paid: { [a.name]: paidA, [b.name]: paidB },
    month_settlement: monthSettlement,
    transfers_net: transfersNet,
    total_settlement: monthSettlement + transfersNet,
    meaning: `positivo = ${b.name} debe a ${a.name}; negativo = al contrario`,
  };
}

function saveUploaded(buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new HttpError(400, `Formato no soportado (${ext})`, "Usa .xlsx, .xlsm, .csv, .txt o .pdf");
  if (buffer.length > MAX_SIZE) throw new HttpError(400, "Archivo demasiado grande (máx 20 MB)");
  fs.mkdirSync(FILES_DIR, { recursive: true });
  const stored = path.join(FILES_DIR, `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`);
  fs.writeFileSync(stored, buffer);
  return stored;
}

const DOCS = `# API de agente — Gestión en Pareja (facturas-ocr)

App de gastos de una pareja (2 cuentas). Esta API permite a un agente cargar datos y administrar el estado sin navegador.

**Autenticación**: cabecera \`Authorization: Bearer <AGENT_API_TOKEN>\` (o \`X-Agent-Token: <token>\`).
El token está en \`/home/ubuntu/code/facturas-ocr/.env.local\` (clave \`AGENT_API_TOKEN\`) y en \`~/.hermes/secrets/facturas-ocr-agent-token\`.

**Base**: \`http://localhost:3456/api/agent\` (o \`http://148.113.46.119:3456/api/agent\`).

## Lectura
- \`GET /overview\` — usuarios, contadores, mes actual, últimos movimientos.
- \`GET /users\` — cuentas (id, nombre, email).
- \`GET /transactions?month=YYYY-MM&from=&to=&type=shared|private&user_id=&category_id=&q=&limit=&offset=\`
- \`GET /transactions/<id>\`
- \`GET /categories\`
- \`GET /invoices\`
- \`GET /balance\` — liquidación del mes + transferencias netas.
- \`GET /transfers\`
- \`GET /import/<id>\` — estado de una importación.

## Escritura
- \`POST /transactions\` — {"user_email"|"user_id"|"user_name", "type":"shared|private", "amount", "date", "description", "category_name"?|"category_id"?, "create_category"?}
- \`POST /transactions/bulk\` — {"transactions":[...]} (mismo formato por elemento; responde ids y errores).
- \`PATCH /transactions/<id>\` — {amount?, date?, description?, category_id?, type?}
- \`DELETE /transactions/<id>\`
- \`POST /categories\` — {"name", "type"?, "icon"?, "color"?}
- \`DELETE /categories/<id>\`
- \`POST /transfers\` — {"from_user_id", "to_user_id", "amount", "date", "description"?}
- \`POST /import\` — importar extracto bancario: multipart/form-data con campo \`file\` (.xlsx/.csv/.pdf) o JSON {"file_path":"/ruta/absoluta"}. Devuelve vista previa con \`import.id\` y filas detectadas.
- \`POST /import/<id>/confirm\` — {"user_id", "type":"shared|private", "create_categories"?=true, "rows"?} — inserta los movimientos en la app.

## Ejemplos
\`\`\`bash
T=$(cat ~/.hermes/secrets/facturas-ocr-agent-token)
curl -s -H "Authorization: Bearer $T" http://localhost:3456/api/agent/overview
curl -s -H "Authorization: Bearer $T" -H "Content-Type: application/json" \\
  -d '{"user_name":"Stan","type":"shared","amount":45.20,"date":"2026-10-11","description":"Cena","category_name":"Restaurantes","create_category":true}' \\
  http://localhost:3456/api/agent/transactions
curl -s -H "Authorization: Bearer $T" -F "file=@/ruta/extracto.pdf" http://localhost:3456/api/agent/import
\`\`\`
`;

// ─── GET ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!agentAuthed(req)) return json({ error: "Token de agente inválido o ausente", hint: "Authorization: Bearer <token>" }, 401);
  try {
    const segs = (await ctx.params).path ?? [];
    const [a, b] = segs;
    const sp = new URL(req.url).searchParams;

    if (!a || a === "docs") return new NextResponse(DOCS, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
    if (a === "overview") return json(overview());
    if (a === "users") return json({ users: getAllUsers().map((u) => ({ id: u.id, name: u.name, email: u.email, color: u.color })) });
    if (a === "categories") return json({ categories: db.prepare("SELECT * FROM categories ORDER BY name").all() });
    if (a === "invoices")
      return json({
        invoices: getAllInvoices().map((i) => ({
          id: i.id, filename: i.filename, proveedor: i.proveedor, fecha: i.fecha, total: i.total, created_at: i.created_at,
        })),
      });
    if (a === "transfers") return json({ transfers: db.prepare("SELECT * FROM transfers ORDER BY date DESC, id DESC").all() });
    if (a === "balance") return json(balanceInfo());
    if (a === "transactions") {
      if (b) {
        const t = getTransaction(parseInt(b));
        if (!t) throw new HttpError(404, "No existe ese gasto");
        return json({ transaction: t });
      }
      return json({ transactions: listTransactions(sp) });
    }
    if (a === "import" && b) {
      const job = loadJob(b);
      if (!job) throw new HttpError(404, "Importación no encontrada");
      return json({ import: job });
    }
    throw new HttpError(404, `Ruta desconocida: GET ${segs.join("/")}`, "Consulta GET /api/agent para ver la documentación.");
  } catch (e) {
    return handleError(e);
  }
}

// ─── POST ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!agentAuthed(req)) return json({ error: "Token de agente inválido o ausente", hint: "Authorization: Bearer <token>" }, 401);
  try {
    const segs = (await ctx.params).path ?? [];
    const [a, b, c] = segs;

    if (a === "transactions" && b === "bulk") {
      const body = await req.json();
      const items: any[] = Array.isArray(body.transactions) ? body.transactions : [];
      if (!items.length) throw new HttpError(400, "Envía {'transactions': [...]}");
      const created: any[] = [];
      const errors: any[] = [];
      for (let i = 0; i < items.length; i++) {
        try {
          created.push({ index: i, ...createTxFromBody(items[i]) });
        } catch (e: any) {
          errors.push({ index: i, error: e.message });
        }
      }
      const status = created.length || !errors.length ? 200 : 400;
      return json({ created: created.length, ids: created.map((x) => x.id), errors }, status);
    }

    if (a === "transactions") {
      const body = await req.json();
      const res = createTxFromBody(body);
      return json({ ok: true, ...res });
    }

    if (a === "categories") {
      const body = await req.json();
      if (!body.name) throw new HttpError(400, "Falta name");
      const cat = createCategory(
        String(body.name),
        body.type === "private" ? "private" : "shared",
        body.icon || "🏷️",
        body.color || "#6b7280",
        body.user_id ? parseInt(body.user_id) : undefined
      );
      return json({ ok: true, category: cat });
    }

    if (a === "transfers") {
      const body = await req.json();
      if (!body.from_user_id || !body.to_user_id || body.amount == null) throw new HttpError(400, "Faltan from_user_id/to_user_id/amount");
      const amount = typeof body.amount === "number" ? body.amount : parseAmount(body.amount);
      if (amount == null) throw new HttpError(400, "amount inválido");
      const id = createTransfer({
        from_user_id: parseInt(body.from_user_id),
        to_user_id: parseInt(body.to_user_id),
        amount: Math.abs(amount),
        date: body.date ? parseDate(body.date) || String(body.date) : new Date().toISOString().slice(0, 10),
        description: String(body.description || ""),
        type: body.type || "reimbursement",
      });
      return json({ ok: true, id });
    }

    if (a === "import" && b && c === "confirm") {
      const body = await req.json().catch(() => ({}));
      const users = getAllUsers();
      const user_id = body.user_id ? parseInt(body.user_id) : users[0]?.id;
      if (!user_id) throw new HttpError(400, "Indica user_id");
      const type = body.type === "private" ? "private" : "shared";
      const res = confirmImport(b, { rows: body.rows, user_id, type, create_categories: body.create_categories !== false });
      return json({ ok: true, ...res });
    }

    if (a === "import") {
      const ct = req.headers.get("content-type") || "";
      let stored: string;
      let originalName: string;
      if (ct.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file") as File | null;
        if (!file) throw new HttpError(400, "Adjunta un archivo con el campo 'file'");
        stored = saveUploaded(Buffer.from(await file.arrayBuffer()), file.name);
        originalName = file.name;
      } else {
        const body = await req.json().catch(() => ({}));
        if (!body.file_path) throw new HttpError(400, "Envía multipart 'file' o JSON {'file_path': '/ruta'}", "Ej: curl -F 'file=@extracto.pdf' ...");
        const src = String(body.file_path);
        if (!fs.existsSync(src)) throw new HttpError(400, `No existe: ${src}`);
        const stat = fs.statSync(src);
        if (stat.size > MAX_SIZE) throw new HttpError(400, "Archivo demasiado grande (máx 20 MB)");
        stored = saveUploaded(fs.readFileSync(src), path.basename(src));
        originalName = path.basename(src);
      }
      const job = await runImport(stored, originalName);
      return json({ ok: true, import: job });
    }

    throw new HttpError(404, `Ruta desconocida: POST ${segs.join("/")}`, "Consulta GET /api/agent para ver la documentación.");
  } catch (e) {
    return handleError(e);
  }
}

// ─── PATCH ─────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!agentAuthed(req)) return json({ error: "Token de agente inválido o ausente" }, 401);
  try {
    const segs = (await ctx.params).path ?? [];
    const [a, b] = segs;
    if (a !== "transactions" || !b) throw new HttpError(404, "Solo PATCH /transactions/<id>");
    const id = parseInt(b);
    const tx = getTransaction(id);
    if (!tx) throw new HttpError(404, "No existe ese gasto");
    const body = await req.json();
    const patch: any = {};
    if (body.amount !== undefined) {
      const amount = typeof body.amount === "number" ? body.amount : parseAmount(body.amount);
      if (amount == null) throw new HttpError(400, "amount inválido");
      patch.amount = Math.abs(amount);
    }
    if (body.date !== undefined) patch.date = parseDate(body.date) || String(body.date);
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.category_id !== undefined) patch.category_id = body.category_id === null ? null : parseInt(body.category_id);
    if (body.type !== undefined) patch.type = body.type === "private" ? "private" : "shared";
    updateTransaction(id, patch);
    return json({ ok: true, transaction: getTransaction(id) });
  } catch (e) {
    return handleError(e);
  }
}

// ─── DELETE ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (!agentAuthed(req)) return json({ error: "Token de agente inválido o ausente" }, 401);
  try {
    const segs = (await ctx.params).path ?? [];
    const [a, b] = segs;
    if (!b) throw new HttpError(400, "Indica el id");
    if (a === "transactions") {
      const tx = getTransaction(parseInt(b));
      if (!tx) throw new HttpError(404, "No existe ese gasto");
      deleteTransaction(parseInt(b));
      return json({ ok: true, deleted: parseInt(b) });
    }
    if (a === "categories") {
      deleteCategory(parseInt(b));
      return json({ ok: true, deleted: parseInt(b) });
    }
    throw new HttpError(404, `Ruta desconocida: DELETE ${segs.join("/")}`);
  } catch (e) {
    return handleError(e);
  }
}
