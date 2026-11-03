import { createHash } from "node:crypto";
import type { HintFacts } from "@/lib/hints";

export const runtime = "nodejs";
export const maxDuration = 30;

const ENDPOINT = "https://api.meta.ai/v1/responses";
const MODEL = "muse-spark-1.3";
const TIMEOUT_MS = 20_000;
const MAX_BODY = 8_000;
const CALLS_PER_HOUR = 60;

/**
 * Muse, the voice in the thief's charm. It only rewords facts the game engine worked out (what's
 * done, what each cut-out can do, what would work); it can't change any result.
 */
const INSTRUCTIONS = `You are Muse, a secret ally who whispers to a thief through a small star-shaped charm during a heist in a museum drawn in pencil.
You receive FACTS computed by the game engine. They are the only truth.
Rules:
- Use only the FACTS. Never invent objects, devices, positions or outcomes.
- Never tell the player to redo anything listed in "done".
- Refer to cut-outs exactly as the FACTS do (e.g. "the 2nd cut-out in your bag"), never by what they might be.
- Level 1 (Nudge): point at what to think about next. Do not say which cut-out or where.
- Level 2 (Clue): say which cut-out does which job. Do not give positions.
- Level 3 (Solution): say which cut-out goes where, including any turn.
- If "needs" is not empty, say what shape of thing to steal from a photo instead.
- At most two short sentences. Warm, a little conspiratorial. No emojis, no stage directions, no asterisks.`;

const cache = new Map<string, string>();
const callLog = new Map<string, number[]>();

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "NO_API_KEY" }, { status: 503 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ ok: false, error: "TOO_LARGE" }, { status: 413 });
  let facts: HintFacts;
  try {
    facts = JSON.parse(raw);
    if (![1, 2, 3].includes(facts.level) || !Array.isArray(facts.todo)) throw new Error("shape");
  } catch {
    return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const key = createHash("sha256").update(raw).digest("hex");
  const hit = cache.get(key);
  if (hit) return Response.json({ ok: true, text: hit, latencyMs: 0, cached: true });

  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (callLog.get(client) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= CALLS_PER_HOUR) return Response.json({ ok: false, error: "RATE_LIMIT" }, { status: 429 });
  callLog.set(client, [...recent, now]);

  const startedAt = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: `FACTS:\n${JSON.stringify(facts, null, 1)}`,
        // The engine already did the thinking; Muse only has to say it. Minimal effort answers in ~3s.
        reasoning: { effort: "minimal" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("hint upstream", res.status);
      return Response.json({ ok: false, error: res.status === 429 ? "RATE_LIMIT" : "UPSTREAM" }, { status: 502 });
    }
    const data = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const text = (data.output ?? [])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join(" ")
      .replace(/\*[^*]+\*/g, "") // drop any "*whispers*" stage directions
      .trim();
    if (!text) return Response.json({ ok: false, error: "EMPTY" }, { status: 502 });
    cache.set(key, text);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return Response.json({ ok: true, text, latencyMs: Date.now() - startedAt });
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === "TimeoutError";
    console.error("hint failed", timeout ? "timeout" : String(err).slice(0, 200));
    return Response.json({ ok: false, error: timeout ? "TIMEOUT" : "UPSTREAM" }, { status: 504 });
  }
}
