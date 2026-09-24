import { db } from "@/db";
import { assets } from "@/db/schema";
import { listColumns } from "@/lib/assetColumns";
import { generateMetadata } from "@/lib/generate";
import type { ContentTypeHint } from "@/lib/platforms";
import { getDefaultProviderId, resolveProvider } from "@/lib/providers/settings";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { providerId?: string };
  const [row] = await db.select().from(assets).where(eq(assets.id, id));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const providerId = body.providerId || (await getDefaultProviderId());
  let provider;
  try {
    provider = await resolveProvider(providerId);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  await db.update(assets).set({ status: "processing", error: null, providerId, model: provider.model, updatedAt: new Date() }).where(eq(assets.id, id));

  try {
    const out = await generateMetadata(provider, {
      filename: row.filename,
      image: row.imageData,
      hint: row.contentTypeHint as ContentTypeHint,
      palette: row.palette,
      width: row.width,
      height: row.height,
    });
    const [updated] = await db
      .update(assets)
      .set({ status: "done", result: out.result, validationNotes: out.notes, error: null, updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning(listColumns);
    return Response.json({ asset: updated });
  } catch (e) {
    const [updated] = await db
      .update(assets)
      .set({ status: "error", error: (e as Error).message.slice(0, 1000), updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning(listColumns);
    return Response.json({ asset: updated, error: (e as Error).message }, { status: 502 });
  }
}
