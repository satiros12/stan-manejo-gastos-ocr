import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTransaction, updateTransaction } from "@/lib/db";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const transactionId = formData.get("transaction_id") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No se subió ningún archivo" }, { status: 400 });
  }

  if (!transactionId) {
    return NextResponse.json({ error: "Se requiere transaction_id" }, { status: 400 });
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
  if (!validTypes.includes(file.type)) {
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  }

  // Save file
  const ext = path.extname(file.name) || ".jpg";
  const safeName = `tx_${transactionId}_${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Update transaction with image path
  updateTransaction(parseInt(transactionId), { image_path: filePath });

  return NextResponse.json({ success: true, image_path: filePath });
}
