import { db } from "@/db";
import { providerSettings } from "@/db/schema";
import { getProviderDef } from "@/lib/providers/registry";
import { getDefaultProviderId, listProviders } from "@/lib/providers/settings";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [providers, defaultProvider] = await Promise.all([listProviders(), getDefaultProviderId()]);
  return Response.json({ providers, defaultProvider });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    id: string;
    apiKey?: string;
    clearKey?: boolean;
    baseUrl?: string;
    model?: string;
    enabled?: boolean;
  };
  const def = getProviderDef(body.id);
  if (!def) return Response.json({ error: "Unknown provider" }, { status: 400 });
  if (body.baseUrl && !/^https?:\/\//i.test(body.baseUrl.trim())) return Response.json({ error: "Base URL must start with http(s)://" }, { status: 400 });

  const [existing] = await db.select().from(providerSettings).where(eq(providerSettings.providerId, def.id));
  const next = {
    providerId: def.id,
    apiKey: body.clearKey ? null : body.apiKey?.trim() ? body.apiKey.trim() : existing?.apiKey ?? null,
    baseUrl: body.baseUrl !== undefined ? body.baseUrl.trim() || null : existing?.baseUrl ?? null,
    model: body.model !== undefined ? body.model.trim() || null : existing?.model ?? null,
    enabled: body.enabled ?? existing?.enabled ?? true,
    updatedAt: new Date(),
  };
  await db.insert(providerSettings).values(next).onConflictDoUpdate({ target: providerSettings.providerId, set: next });
  const providers = await listProviders();
  return Response.json({ providers });
}
