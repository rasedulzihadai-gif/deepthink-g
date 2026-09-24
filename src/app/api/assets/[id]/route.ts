import { db } from "@/db";
import { assets } from "@/db/schema";
import { listColumns } from "@/lib/assetColumns";
import { enforceRules, SchemaError } from "@/lib/validate";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const HINTS = new Set(["auto", "single_asset", "template_pack"]);
const FILE_TYPES = new Set(["unknown", "jpeg", "png", "eps", "ai"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [row] = await db.select().from(assets).where(eq(assets.id, id));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ asset: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await req.json()) as { contentTypeHint?: string; fileType?: string; result?: unknown };
  const patch: Partial<typeof assets.$inferInsert> = { updatedAt: new Date() };
  if (body.contentTypeHint !== undefined) {
    if (!HINTS.has(body.contentTypeHint)) return Response.json({ error: "Invalid contentTypeHint" }, { status: 400 });
    patch.contentTypeHint = body.contentTypeHint;
  }
  if (body.fileType !== undefined) {
    if (!FILE_TYPES.has(body.fileType)) return Response.json({ error: "Invalid fileType" }, { status: 400 });
    patch.fileType = body.fileType;
  }
  if (body.result !== undefined) {
    // Manual edits go through the same strict validation + rule enforcement as model output.
    try {
      const ct = (body.result as { content_type?: string })?.content_type;
      const { result, notes } = enforceRules(body.result, ct === "template_pack" || ct === "single_asset" ? ct : "auto");
      patch.result = result;
      patch.validationNotes = notes.length ? ["manual edit:", ...notes] : ["manual edit: passed validation"];
      patch.status = "done";
    } catch (e) {
      const msg = e instanceof SchemaError ? e.errors.join("; ") : (e as Error).message;
      return Response.json({ error: msg }, { status: 400 });
    }
  }
  const [row] = await db.update(assets).set(patch).where(eq(assets.id, id)).returning(listColumns);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ asset: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await db.delete(assets).where(eq(assets.id, id));
  return Response.json({ ok: true });
}
