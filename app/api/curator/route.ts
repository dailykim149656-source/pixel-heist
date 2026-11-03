import { normalizeSpec, ROOM_SHAPE, type RoomSpec } from "@/lib/curator";

export const runtime = "nodejs";
export const maxDuration = 45;

const ENDPOINT = "https://api.meta.ai/v1/responses";
/** Muse Spark 1.3 first; 1.2 answers when 1.3 is overloaded (it was returning 504s on 2026-11-03). */
const MODELS = ["muse-spark-1.3", "muse-spark-1.2"];
const TIMEOUT_MS = 35_000;
const MAX_BODY = 6_000;
const CALLS_PER_HOUR = 30;

/**
 * The Curator designs a room for the loot the player brought. Muse returns a design inside the
 * engine's parameters (JSON Schema); the browser compiles it and the engine decides whether this
 * loot can beat it. When it can't, the engine's reason comes back here as feedback for one retry.
 */
const INSTRUCTIONS = `You are the Curator, who drew every rule of a museum sketched in pencil. A thief has cut real objects out of photos and brought them in. Design one room to test exactly this loot.
How the room works (the engine decides everything, by shape only):
- camera: anything big enough held across its red rays blocks it; "need" is how many of 7 rays must be covered (higher is harder).
- beams (needs a camera): sensor wires across the camera's view that nothing may touch. Only thin bars fit between two beams.
- gap: crossed by laying a long, thin cut-out over it (thickness under about 40px, length about 150px or more). "rise" makes the far ledge higher, so the bar must be turned; 50 is hard, 0 is level.
- drawbridge controls on the far side of a gap give other ways across: "plate" needs something solid and chunky (thickness 24px or more) resting on it; "hook" needs something with a real hole (holes >= 1).
- door (before the gap): opened by its "plate" or "hook", same rules.
Design rules:
- Every obstacle must be beatable by some cut-out in the loot, using a different cut-out for each job. Count them.
- If the loot has 2 or more cut-outs, the room must need at least 2 of them.
- Make each cut-out's shape matter: a hole means a hook somewhere, a long bar means a gap, a chunky block means a plate or the camera.
- Prefer giving the gap more than one way across when the loot allows it.
- The curatorLine taunts the thief about their loot by shape ("a long bar and something with a hole..."), never by object names.
Reply with one JSON object only, shaped: ${ROOM_SHAPE}`;

const callLog = new Map<string, number[]>();

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "NO_API_KEY" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ ok: false, error: "TOO_LARGE" }, { status: 413 });
  let body: { loot: unknown[]; feedback?: string; previous?: RoomSpec };
  try {
    body = JSON.parse(raw);
    if (!Array.isArray(body.loot) || body.loot.length === 0 || body.loot.length > 5) throw new Error("loot");
  } catch {
    return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (callLog.get(client) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= CALLS_PER_HOUR) return Response.json({ ok: false, error: "RATE_LIMIT" }, { status: 429 });
  callLog.set(client, [...recent, now]);

  const input = [
    `LOOT:\n${JSON.stringify(body.loot, null, 1)}`,
    body.previous && body.feedback
      ? `Your previous design was rejected by the engine.\nDESIGN: ${JSON.stringify(body.previous)}\nREASON: ${String(body.feedback).slice(0, 600)}\nDesign again and fix that.`
      : "",
  ].join("\n\n");

  const startedAt = Date.now();
  const ask = (model: string, budgetMs: number) =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: INSTRUCTIONS,
        input,
        // The engine checks every design and sends back its reason, so speed beats deliberation.
        // Strict JSON Schema took 30s+; JSON-object mode at minimal effort answers in ~5s, and
        // normalizeSpec + compileRoom clamp whatever comes back into the supported ranges.
        reasoning: { effort: "minimal" },
        text: { format: { type: "json_object" } },
      }),
      signal: AbortSignal.timeout(budgetMs),
    });
  try {
    let res: Response | null = null, model = MODELS[0];
    for (const [i, m] of MODELS.entries()) {
      model = m;
      try {
        res = await ask(m, i === 0 ? 10_000 : Math.max(5_000, TIMEOUT_MS - (Date.now() - startedAt)));
      } catch (err) {
        if (i === MODELS.length - 1) throw err;
        console.warn("curator fallback", m, "timeout");
        continue;
      }
      if (res.status < 500) break;
      console.warn("curator fallback", m, res.status);
    }
    if (!res || !res.ok) {
      console.error("curator upstream", res?.status);
      return Response.json({ ok: false, error: res?.status === 429 ? "RATE_LIMIT" : "UPSTREAM" }, { status: 502 });
    }
    const data = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const text = (data.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "";
    const spec: RoomSpec = normalizeSpec(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
    return Response.json({ ok: true, spec, model, latencyMs: Date.now() - startedAt });
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === "TimeoutError";
    console.error("curator failed", timeout ? "timeout" : String(err).slice(0, 200));
    return Response.json({ ok: false, error: timeout ? "TIMEOUT" : "UPSTREAM" }, { status: 504 });
  }
}
