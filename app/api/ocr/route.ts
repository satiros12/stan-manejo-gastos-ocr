import { NextRequest, NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { insertInvoice } from "@/lib/db";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const PROJECT_DIR = process.cwd();
const VENV_PYTHON = process.env.OCR_VENV_PYTHON || path.join(PROJECT_DIR, "venv", "bin", "python3");
const OCR_SCRIPT = path.join(PROJECT_DIR, "lib", "ocr.py");
const OPENCODE_BIN = path.join(process.env.HOME || "/home/ubuntu", ".opencode", "bin", "opencode");

function getPython(): string {
  return fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Call opencode CLI with a prompt and return the output.
 * Uses spawn for better signal handling.
 */
function callOpenCode(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(OPENCODE_BIN)) {
      reject(new Error(`opencode not found at ${OPENCODE_BIN}`));
      return;
    }

    const child = spawn(OPENCODE_BIN, ["run", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TERM: "dumb", HOME: process.env.HOME || "/home/ubuntu" },
      timeout: 180000, // 3 min timeout
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code, signal) => {
      if (code === 0 || (code === null && signal === null)) {
        resolve(stdout);
      } else if (signal === "SIGTERM" || signal === "SIGKILL") {
        reject(new Error(`opencode timed out or was killed (signal: ${signal})`));
      } else {
        // Non-zero exit but still try to use output
        if (stdout.trim()) {
          resolve(stdout);
        } else {
          reject(new Error(`opencode exited with code ${code}${stderr ? ": " + stderr.substring(0, 200) : ""}`));
        }
      }
    });
  });
}

/**
 * Parse OCR text using opencode CLI.
 */
async function parseWithLLM(ocrText: string): Promise<Record<string, any>> {
  const prompt = `Extract invoice data from the OCR text. Return ONLY valid JSON.

Required JSON structure:
{
  "proveedor": "supplier name or null",
  "cif_nif": "tax ID or null",
  "fecha": "date in DD/MM/YYYY or null",
  "numero_factura": "invoice number or null",
  "base_imponible": "subtotal number or null",
  "iva": "VAT amount number or null",
  "iva_porcentaje": "VAT percentage number or null",
  "total": "total number or null",
  "moneda": "currency code or null",
  "lineas": [{"descripcion": "item", "importe": "price number or null"}]
}

OCR TEXT:
${ocrText.substring(0, 3000)}

Rules: Use dot for decimals. null if not found. Only JSON, no other text.`;

  try {
    const output = await callOpenCode(prompt);
    // Strip the "> build · model" header line
    const lines = output.split("\n");
    const jsonStr = lines[0]?.startsWith(">") ? lines.slice(1).join("\n").trim() : output.trim();

    // Try parsing as JSON directly
    try {
      return JSON.parse(jsonStr);
    } catch {
      // Try extracting from code blocks
      const blockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (blockMatch) return JSON.parse(blockMatch[1]);
      const objMatch = jsonStr.match(/(\{[\s\S]*\})/);
      if (objMatch) return JSON.parse(objMatch[1]);
      throw new Error("Could not parse LLM output as JSON");
    }
  } catch (err: any) {
    return { error: `LLM: ${err.message || err}` };
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se subió ningún archivo" }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Formato no soportado: ${file.type}. Usa JPG, PNG, WebP, TIFF o PDF.` },
        { status: 400 }
      );
    }

    // Save uploaded file
    const ext = path.extname(file.name) || ".jpg";
    const safeName = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Step 1: OCR with Python + Tesseract
    const pythonBin = getPython();
    const ocrResult = await execFileAsync(pythonBin, [OCR_SCRIPT, filePath], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const ocrText = ocrResult.stdout.trim();

    if (!ocrText) {
      const invoiceId = insertInvoice({
        filename: file.name,
        image_path: filePath,
        error: "No se pudo extraer texto de la imagen",
      });
      return NextResponse.json({
        success: true,
        id: invoiceId,
        filename: file.name,
        error: "No se pudo extraer texto de la imagen",
      });
    }

    // Step 2: Parse with LLM (opencode directly from Node.js)
    const parsed = await parseWithLLM(ocrText);

    // Step 3: Save to database
    const invoiceId = insertInvoice({
      filename: file.name,
      image_path: filePath,
      ocr_text: ocrText,
      proveedor: parsed.proveedor ?? null,
      cif_nif: parsed.cif_nif ?? null,
      fecha: parsed.fecha ?? null,
      numero_factura: parsed.numero_factura ?? null,
      base_imponible: parsed.base_imponible ?? null,
      iva: parsed.iva ?? null,
      iva_porcentaje: parsed.iva_porcentaje ?? null,
      total: parsed.total ?? null,
      moneda: parsed.moneda || "EUR",
      lineas: parsed.lineas || [],
      raw_response: JSON.stringify(parsed),
      error: parsed.error || null,
    });

    return NextResponse.json({
      success: true,
      id: invoiceId,
      filename: file.name,
      ocr_text: ocrText,
      ...parsed,
      error: parsed.error || null,
    });
  } catch (error: any) {
    console.error("OCR error:", error);
    return NextResponse.json(
      { error: `Error: ${error.message || "desconocido"}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { getAllInvoices } = await import("@/lib/db");
  const invoices = getAllInvoices();
  return NextResponse.json({ invoices });
}
