// Confirmación de una importación (versión web con sesión).
// POST { id, rows?, user_id?, type?, create_categories? } → inserta los gastos.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmImport } from "@/lib/import_pipeline";
import { getUserById, getAllUsers } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const sessionUserId = parseInt(session.user.id);
    const target = body.user_id ? parseInt(body.user_id) : sessionUserId;
    if (!getUserById(target)) return NextResponse.json({ error: "Usuario no válido" }, { status: 400 });
    const type = body.type === "private" ? "private" : "shared";
    const res = confirmImport(String(body.id), {
      rows: body.rows,
      user_id: target,
      type,
      create_categories: body.create_categories !== false,
    });
    return NextResponse.json({ ok: true, ...res, users: getAllUsers().length });
  } catch (e: any) {
    console.error("import confirm error:", e);
    return NextResponse.json({ error: e?.message || "Error confirmando la importación" }, { status: 500 });
  }
}
