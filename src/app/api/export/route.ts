import { db } from "@/db";
import { assets } from "@/db/schema";
import { buildCsv } from "@/lib/csv";
import { FileType, MetadataResult, PLATFORM_IDS, PlatformId } from "@/lib/platforms";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { platform: PlatformId; ids?: number[]; truncateAdobeNames?: boolean };
  if (!PLATFORM_IDS.includes(body.platform)) return Response.json({ error: "Unknown platform" }, { status: 400 });
  const where = body.ids?.length ? and(eq(assets.status, "done"), inArray(assets.id, body.ids)) : eq(assets.status, "done");
  const rows = await db
    .select({ filename: assets.filename, fileType: assets.fileType, result: assets.result })
    .from(assets)
    .where(where)
    .orderBy(assets.id);
  const items = rows
    .filter((r) => r.result)
    .map((r) => ({ filename: r.filename, fileType: r.fileType as FileType, result: r.result as MetadataResult }));
  if (!items.length) return Response.json({ error: "No completed assets to export" }, { status: 400 });
  return Response.json({ ...buildCsv(body.platform, items, { truncateAdobeNames: body.truncateAdobeNames }), count: items.length });
}
