import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTransaction } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 401, statusText: "No autenticado" });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type") || "invoice";

  if (!id) {
    return new NextResponse(null, { status: 400, statusText: "Se requiere id" });
  }

  let filePath: string | null = null;

  if (type === "transaction") {
    const tx = getTransaction(parseInt(id));
    if (!tx || !tx.image_path) {
      return new NextResponse(null, { status: 404, statusText: "Imagen no encontrada" });
    }
    filePath = tx.image_path;
  } else {
    // Invoice image - from the invoices table
    const { getInvoice } = await import("@/lib/db");
    const inv = getInvoice(parseInt(id));
    if (!inv || !inv.image_path) {
      return new NextResponse(null, { status: 404, statusText: "Imagen no encontrada" });
    }
    filePath = inv.image_path;
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return new NextResponse(null, { status: 404, statusText: "Archivo no encontrado" });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".tiff": "image/tiff",
  }[ext] || "application/octet-stream";

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
