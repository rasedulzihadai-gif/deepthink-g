import { callProvider, ChatTurn } from "./providers/call";
import type { ResolvedProvider } from "./providers/settings";
import { SYSTEM_PROMPT, buildRepairPrompt, buildUserPrompt } from "./prompt";
import { acceptRewrittenTitle, enforceRules, extractJson, OverLimitTitle, SchemaError } from "./validate";
import type { ContentTypeHint, MetadataResult } from "./platforms";

export interface GenerateInput {
  filename: string;
  image: string;
  hint: ContentTypeHint;
  palette?: string[] | null;
  width?: number | null;
  height?: number | null;
}

export interface GenerateOutput {
  result: MetadataResult;
  notes: string[];
  attempts: number;
  raw: string;
}

/** Full pipeline: prompt → provider → strict schema check (1 repair retry) → deterministic rule enforcement. */
export async function generateMetadata(provider: ResolvedProvider, input: GenerateInput): Promise<GenerateOutput> {
  const turns: ChatTurn[] = [
    {
      role: "user",
      text: buildUserPrompt({ filename: input.filename, hint: input.hint, palette: input.palette ?? undefined, width: input.width, height: input.height }),
      image: input.image,
    },
  ];
  let lastErrors: string[] = [];
  let raw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    raw = await callProvider(provider, SYSTEM_PROMPT, turns, { jsonMode: true });
    try {
      const parsed = extractJson(raw);
      const { result, notes, overLimit } = enforceRules(parsed, input.hint);
      if (attempt > 1) notes.unshift(`schema repaired on retry (${lastErrors.length} issue(s))`);
      if (overLimit.length) await rewriteTitles(provider, turns, raw, result, overLimit, notes);
      return { result, notes, attempts: attempt, raw };
    } catch (e) {
      if (!(e instanceof SchemaError)) throw e;
      lastErrors = e.errors;
      turns.push({ role: "assistant", text: raw.slice(0, 6000) });
      turns.push({ role: "user", text: buildRepairPrompt(e.errors) });
    }
  }
  throw new Error(`Model output failed strict validation after retry: ${lastErrors.join("; ")}`);
}

/**
 * Rule G/H length repair: ask the model to rewrite only the over-limit titles (keeping the most commercially
 * distinctive 2–3 elements for template packs). Accepted only if they fit; otherwise the deterministic fix stays.
 */
async function rewriteTitles(
  provider: ResolvedProvider,
  turns: ChatTurn[],
  raw: string,
  result: MetadataResult,
  overLimit: OverLimitTitle[],
  notes: string[]
) {
  const isTemplate = result.content_type === "template_pack";
  const list = overLimit.map((o) => `- ${o.platform}: "${o.original}" (${o.original.length} chars, max ${o.max})`).join("\n");
  const ask = `These titles exceed the character ceiling:\n${list}\nRewrite ONLY these titles so each fits its max.${
    isTemplate
      ? " Rule H: keep the 2–3 most commercially distinctive contained elements, the colour/style direction and the template kind (e.g. poster templates); drop the rest. Use \"replaceable text\" never \"editable text\"."
      : " Rule G: keep subject + style + colour; natural sentence."
  } Return JSON only: {"titles": {"<platform>": "<new title>"}}`;
  try {
    const text = await callProvider(provider, SYSTEM_PROMPT, [...turns, { role: "assistant", text: raw.slice(0, 6000) }, { role: "user", text: ask }], {
      jsonMode: true,
      maxTokens: 600,
    });
    const parsed = extractJson(text) as { titles?: Record<string, unknown> };
    for (const o of overLimit) {
      const t = acceptRewrittenTitle(parsed.titles?.[o.platform], o.max, isTemplate);
      if (!t) continue;
      result.platforms[o.platform].title = t;
      if (o.platform === "shutterstock") result.platforms.shutterstock.description = t;
      notes.push(`${o.platform}: model rewrote over-limit title → ${t.length} chars (rule ${isTemplate ? "H" : "G"})`);
    }
  } catch (e) {
    notes.push(`title rewrite call failed (${(e as Error).message.slice(0, 80)}); kept deterministic fix`);
  }
}
