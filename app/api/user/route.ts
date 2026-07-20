import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById, updateUser } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await request.json();
  const user = getUserById(userId);

  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // Password change
  if (body.currentPassword && body.newPassword) {
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
    if (body.newPassword.length < 4) return NextResponse.json({ error: "La nueva contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    const hashed = await bcrypt.hash(body.newPassword, 10);
    updateUser(userId, { password: hashed });
    return NextResponse.json({ success: true, message: "Contraseña actualizada" });
  }

  // Name change
  if (body.name) {
    if (body.name.trim().length < 1) return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
    updateUser(userId, { name: body.name.trim() });
    return NextResponse.json({ success: true, message: "Nombre actualizado" });
  }

  return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
}
