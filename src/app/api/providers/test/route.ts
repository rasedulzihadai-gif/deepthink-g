import { callProvider } from "@/lib/providers/call";
import { resolveProvider } from "@/lib/providers/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };
  try {
    const p = await resolveProvider(id);
    const started = Date.now();
    const text = await callProvider(p, "You are a connectivity check. Reply with the single word OK.", [{ role: "user", text: "Ping" }], { maxTokens: 20 });
    return Response.json({ ok: true, model: p.model, latencyMs: Date.now() - started, reply: text.slice(0, 80) });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
