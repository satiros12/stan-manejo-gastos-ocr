import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboard, getAllUsers } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const data = getDashboard(userId, month);
  const users = getAllUsers();

  return NextResponse.json({ ...data, users });
}
