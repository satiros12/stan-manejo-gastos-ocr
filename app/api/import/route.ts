// Importación de extractos (versión web con sesión).
// POST: sube un archivo (multipart) y devuelve la vista previa.
// GET ?id= : recupera una vista previa existente.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { runImport, loadJob } from "@/lib/import_pipeline";

const FILES_DIR = path.join(process.cwd(), "data", "imports", "files");
const ALLOWED_EXT = [".xlsx", ".xlsm", ".csv", ".txt", ".pdf"];
const MAX_SIZE = 20 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const job = loadJob(id);
  if (!job) return NextResponse.json({ error: "Importación no encontrada" }, { status: 404 });
  return NextResponse.json({ import: job });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No se subió ningún archivo" }, { status: 400 });
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { error: `Formato no soportado (${ext}). Usa Excel (.xlsx), CSV o PDF del banco.` },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_SIZE) return NextResponse.json({ error: "Archivo demasiado grande (máx 20 MB)" }, { status: 400 });
    fs.mkdirSync(FILES_DIR, { recursive: true });
    const stored = path.join(FILES_DIR, `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`);
    fs.writeFileSync(stored, buf);
    const job = await runImport(stored, file.name);
    return NextResponse.json({ import: job });
  } catch (e: any) {
    console.error("import error:", e);
    return NextResponse.json({ error: e?.message || "Error procesando el archivo" }, { status: 500 });
  }
}
