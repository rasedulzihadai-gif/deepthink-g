import { db } from "@/db";
import { assets } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const HINTS = new Set(["auto", "single_asset", "template_pack"]);

import { listColumns } from "@/lib/assetColumns";

export async function GET() {
  const rows = await db.select(listColumns).from(assets).orderBy(desc(assets.id));
  return Response.json({ assets: rows });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    filename: string;
    imageData: string;
    thumbData: string;
    width?: number;
    height?: number;
    palette?: string[];
    contentTypeHint?: string;
  };
  if (!body.filename || !body.imageData?.startsWith("data:image/") || !body.thumbData?.startsWith("data:image/"))
    return Response.json({ error: "filename, imageData and thumbData (data URLs) are required" }, { status: 400 });
  if (body.imageData.length > 8_000_000) return Response.json({ error: "Image too large" }, { status: 413 });
  const hint = body.contentTypeHint && HINTS.has(body.contentTypeHint) ? body.contentTypeHint : "auto";
  const [row] = await db
    .insert(assets)
    .values({
      filename: body.filename.slice(0, 255),
      imageData: body.imageData,
      thumbData: body.thumbData,
      width: body.width ?? null,
      height: body.height ?? null,
      palette: Array.isArray(body.palette) ? body.palette.slice(0, 6).map(String) : null,
      contentTypeHint: hint,
    })
    .returning(listColumns);
  return Response.json({ asset: row });
}

export async function DELETE() {
  await db.delete(assets);
  return Response.json({ ok: true });
}
