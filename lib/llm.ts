// Cliente LLM (OpenCode Zen · deepseek-v4-flash) para el pipeline de importación.
// Nota: el proveedor bloquea User-Agents no-navegador → enviamos UA de navegador.

const ZEN_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const MODEL = "deepseek-v4-flash";

export async function callLLM(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; session?: string } = {}
): Promise<string> {
  const key = process.env.OPENCODE_GO_API_KEY;
  if (!key) throw new Error("OPENCODE_GO_API_KEY no configurada en el entorno");

  const makeBody = (withThinking: boolean) => {
    const b: Record<string, unknown> = {
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.1,
    };
    if (withThinking) b.thinking = { type: "disabled" };
    return b;
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "x-opencode-session": opts.session || "facturas-import",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };

  let res = await fetch(ZEN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(makeBody(true)),
    signal: AbortSignal.timeout(150000),
  });
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    // Algunos despliegues rechazan el parámetro thinking → reintento sin él
    res = await fetch(ZEN_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(makeBody(false)),
      signal: AbortSignal.timeout(150000),
    });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await res.json();
  const msg = data?.choices?.[0]?.message;
  const content: string = msg?.content ?? "";
  if (!content && msg?.reasoning_content) return String(msg.reasoning_content);
  return content;
}

/** Extrae el primer objeto/array JSON de un texto (tolera ```json ... ``` y prosa alrededor). */
export function extractJSON<T = any>(text: string): T {
  if (!text) throw new Error("respuesta LLM vacía");
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.search(/[[{]/);
  if (start < 0) throw new Error("sin JSON en la respuesta: " + t.slice(0, 200));
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error("JSON incompleto en la respuesta del LLM");
}
