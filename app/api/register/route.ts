import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db, { createUser, getAllUsers } from "@/lib/db";

const MAX_CUENTAS = 2;

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    }

    const existing = getAllUsers();
    if (existing.length >= MAX_CUENTAS) {
      return NextResponse.json(
        { error: "Las dos cuentas ya están creadas. Esta app es para dos personas (tú y tu pareja)." },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = createUser(name, email, hashed);

    // Primera cuenta en verde, segunda en índigo
    const color = existing.length === 0 ? "#0f8a5f" : "#6366f1";
    db.prepare("UPDATE users SET color = ? WHERE id = ?").run(color, user.id);

    return NextResponse.json({ success: true, id: user.id, name: user.name, email: user.email });
  } catch (error: any) {
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ error: "El email ya está registrado" }, { status: 400 });
    }
    console.error("Register error:", error);
    return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
  }
}
