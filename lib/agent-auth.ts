import crypto from "crypto";
import { NextRequest } from "next/server";

/**
 * Autenticación de la API de agente.
 * Acepta `Authorization: Bearer <token>` o `X-Agent-Token: <token>`.
 * El token vive en AGENT_API_TOKEN (.env.local y unidad systemd).
 */
export function agentAuthed(req: NextRequest): boolean {
  const token = process.env.AGENT_API_TOKEN;
  if (!token) return false;
  const h = req.headers.get("authorization") || "";
  const provided = h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : (req.headers.get("x-agent-token") || "").trim();
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
