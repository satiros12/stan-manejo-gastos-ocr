import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, getAllUsers, createGroup, getUserDefaultGroup } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, inviteCode } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    }

    const existing = getAllUsers();
    const isViaInvite = !!inviteCode;

    // If not via invite, enforce max 2 users for auto-created groups
    // (via invite, the group's max_members is the limit)
    if (!isViaInvite && existing.length >= 2) {
      return NextResponse.json({ error: "Máximo 2 usuarios sin invitación. Pide a tu pareja que te genere un enlace." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = createUser(name, email, hashed);

    // Assign color
    const color = existing.length === 0 ? "#0f8a5f" : "#6366f1";
    import("@/lib/db").then(mod => {
      mod.default.prepare("UPDATE users SET color = ? WHERE id = ?").run(color, user.id);
    }).catch(() => {});

    let group = null;

    if (isViaInvite) {
      // Join existing group via invite code
      const { joinGroup } = await import("@/lib/db");
      group = joinGroup(inviteCode, user.id);
      if (!group) {
        // Group full or invalid, but user was created. Clean up?
        return NextResponse.json({
          success: true, id: user.id, name: user.name, email: user.email,
          warning: "Usuario creado pero el código de invitación no es válido o el grupo está lleno"
        });
      }
    } else if (existing.length === 0) {
      // First user: create a group
      const groupName = `${name.split(" ")[0]}'s Home`;
      group = createGroup(groupName, user.id);
    } else {
      // Second user (no invite): join the first group
      const firstUser = existing[0];
      const userGroups = (await import("@/lib/db")).getUserGroups;
      const groups = userGroups(firstUser.id);
      if (groups.length > 0) {
        const { joinGroup } = await import("@/lib/db");
        group = joinGroup(groups[0].invite_code!, user.id);
      }
    }

    return NextResponse.json({
      success: true,
      id: user.id,
      name: user.name,
      email: user.email,
      group: group ? { id: group.id, name: group.name, invite_code: group.invite_code } : null,
    });
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: "El email ya está registrado" }, { status: 400 });
    }
    console.error("Register error:", error);
    return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
  }
}
