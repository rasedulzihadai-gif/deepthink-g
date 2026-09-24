import { db } from "@/db";
import { appSettings, providerSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PROVIDER_ID, PROVIDERS, ProviderDef, getProviderDef } from "./registry";

export interface ResolvedProvider {
  def: ProviderDef;
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  keySource: "saved" | "env" | "none";
}

export async function resolveProvider(id: string): Promise<ResolvedProvider> {
  const def = getProviderDef(id);
  if (!def) throw new Error(`Unknown provider "${id}"`);
  const [row] = await db.select().from(providerSettings).where(eq(providerSettings.providerId, id));
  const envKey = process.env[def.envKey] ?? "";
  const savedKey = row?.apiKey ?? "";
  return {
    def,
    apiKey: savedKey || envKey,
    baseUrl: (row?.baseUrl || def.baseUrl).replace(/\/+$/, ""),
    model: row?.model || def.model,
    enabled: row?.enabled ?? true,
    keySource: savedKey ? "saved" : envKey ? "env" : "none",
  };
}

export async function listProviders() {
  const rows = await db.select().from(providerSettings);
  return PROVIDERS.map((def) => {
    const row = rows.find((r) => r.providerId === def.id);
    const envKey = process.env[def.envKey] ?? "";
    const savedKey = row?.apiKey ?? "";
    const key = savedKey || envKey;
    return {
      id: def.id,
      label: def.label,
      wireFormat: def.wireFormat,
      kind: def.kind,
      notes: def.notes,
      envKey: def.envKey,
      defaultBaseUrl: def.baseUrl,
      defaultModel: def.model,
      baseUrl: row?.baseUrl || def.baseUrl,
      model: row?.model || def.model,
      enabled: row?.enabled ?? true,
      keySource: savedKey ? "saved" : envKey ? "env" : "none",
      keyPreview: key ? `••••${key.slice(-4)}` : "",
      configured: Boolean(key && (row?.baseUrl || def.baseUrl) && (row?.model || def.model)),
    };
  });
}

export async function getDefaultProviderId(): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "default_provider"));
  const id = row?.value;
  return id && getProviderDef(id) ? id : DEFAULT_PROVIDER_ID;
}

export async function setDefaultProviderId(id: string) {
  if (!getProviderDef(id)) throw new Error("Unknown provider");
  await db
    .insert(appSettings)
    .values({ key: "default_provider", value: id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: id } });
}
