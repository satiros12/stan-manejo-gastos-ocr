import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getUserDefaultGroup, getGroupById, getGroupMembers,
  regenerateInviteCode, getUserGroups, getGroupByInviteCode,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("_action");

  if (action === "my-groups") {
    const groups = getUserGroups(userId);
    const defaultGroup = getUserDefaultGroup(userId);
    return NextResponse.json({ groups, defaultGroup });
  }

  if (action === "group-detail") {
    const groupId = searchParams.get("id");
    if (!groupId) return NextResponse.json({ error: "Se requiere id" }, { status: 400 });
    const group = getGroupById(parseInt(groupId));
    if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    const members = getGroupMembers(parseInt(groupId));
    return NextResponse.json({ group, members });
  }

  if (action === "check-invite") {
    const code = searchParams.get("code");
    if (!code) return NextResponse.json({ error: "Se requiere código" }, { status: 400 });
    const group = getGroupByInviteCode(code);
    if (!group) return NextResponse.json({ valid: false, error: "Código inválido" });
    return NextResponse.json({ valid: true, group: { id: group.id, name: group.name, member_count: getGroupMembers(group.id).length } });
  }

  return NextResponse.json({ error: "Acción no especificada" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("_action");

  if (action === "regenerate-invite") {
    const groupId = searchParams.get("id");
    if (!groupId) return NextResponse.json({ error: "Se requiere id" }, { status: 400 });
    const code = regenerateInviteCode(parseInt(groupId));
    return NextResponse.json({ invite_code: code });
  }

  return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
}
