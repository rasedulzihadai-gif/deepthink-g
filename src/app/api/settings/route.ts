import { getDefaultProviderId, setDefaultProviderId } from "@/lib/providers/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ defaultProvider: await getDefaultProviderId() });
}

export async function PUT(req: Request) {
  const { defaultProvider } = (await req.json()) as { defaultProvider: string };
  try {
    await setDefaultProviderId(defaultProvider);
    return Response.json({ defaultProvider });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
