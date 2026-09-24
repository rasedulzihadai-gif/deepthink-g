import {
  ContentType,
  ContentTypeHint,
  FILLER_TERMS,
  MetadataResult,
  PLATFORMS,
  PLATFORM_IDS,
  PlatformId,
  PlatformMeta,
  TEMPLATE_ONLY_TERMS,
  TEMPLATE_PURPOSE_TERMS,
  ADOBE_CATEGORIES,
  SHUTTERSTOCK_CATEGORIES,
  getPlatform,
} from "./platforms";

export class SchemaError extends Error {
  constructor(public errors: string[]) {
    super("Schema validation failed: " + errors.join("; "));
  }
}

/** Extract a JSON object from raw model text (tolerates code fences / leading prose). */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new SchemaError(["response contained no JSON object"]);
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    throw new SchemaError([`invalid JSON: ${(e as Error).message}`]);
  }
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Phase 1 — strict structural check. Throws SchemaError listing every problem. */
export function checkSchema(data: unknown): void {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new SchemaError(["root must be a JSON object"]);
  const d = data as Record<string, unknown>;
  if (d.content_type !== "single_asset" && d.content_type !== "template_pack")
    errors.push(`content_type must be "single_asset" or "template_pack" (got ${JSON.stringify(d.content_type)})`);
  if (!isStr(d.description) || !d.description.trim()) errors.push("description must be a non-empty string");
  if (!isStr(d.category_suggestion) || !d.category_suggestion.trim()) errors.push("category_suggestion must be a non-empty string");
  if (!Array.isArray(d.flags) || !d.flags.every(isStr)) errors.push("flags must be an array of strings");
  const p = d.platforms as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") errors.push("platforms must be an object");
  else {
    for (const id of PLATFORM_IDS) {
      const m = p[id] as Record<string, unknown> | undefined;
      if (!m || typeof m !== "object") {
        errors.push(`platforms.${id} missing`);
        continue;
      }
      if (!isStr(m.title) || !m.title.trim()) errors.push(`platforms.${id}.title must be a non-empty string`);
      if (m.description !== undefined && !isStr(m.description)) errors.push(`platforms.${id}.description must be a string`);
      if (!Array.isArray(m.keywords) || !m.keywords.every(isStr)) errors.push(`platforms.${id}.keywords must be an array of strings`);
      else if (m.keywords.length < 5) errors.push(`platforms.${id}.keywords has only ${m.keywords.length} items`);
      if (!isStr(m.category)) errors.push(`platforms.${id}.category must be a string`);
    }
  }
  if (errors.length) throw new SchemaError(errors);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rule C — strip filler terms from free text. */
function stripFiller(text: string): string {
  let out = text;
  for (const f of FILLER_TERMS) {
    out = out.replace(new RegExp(`\\b${escapeRe(f)}\\b\\s*`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/^[,.;:\s]+/, "").trim();
}

/** Rule J — "editable text" → "replaceable text" (text claims only). */
const EDITABLE_TEXT_RE =
  /\beditable(\s+(?:and\s+\w+\s+)?)(text|texts|typography|type|headline|headlines|title|titles|font|fonts|lettering|copy|caption|captions|wording)\b/gi;
const TEXT_IS_EDITABLE_RE = /\b(text|typography|headline|headlines|fonts?|lettering)(\s+(?:is|are)\s+(?:fully\s+)?)editable\b/gi;

export function applyReplaceableText(text: string): string {
  return text
    .replace(EDITABLE_TEXT_RE, (m, mid: string, noun: string) => {
      const rep = m[0] === "E" ? "Replaceable" : "replaceable";
      return `${rep}${mid}${noun}`;
    })
    .replace(TEXT_IS_EDITABLE_RE, (_m, noun: string, mid: string) => `${noun}${mid}replaceable`);
}

/** Truncate to a max length on a word boundary, trimming dangling connectors. */
export function fitTitle(title: string, max: number): string {
  let t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  t = t.slice(0, max + 1);
  const lastSpace = t.lastIndexOf(" ");
  t = lastSpace > 20 ? t.slice(0, lastSpace) : t.slice(0, max);
  const dangling = /[\s,;:\-–—]+(and|with|for|of|in|on|the|a|an|or|to|by|featuring)?\s*$/i;
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(dangling, "").trim();
  }
  return t.replace(/[,;:\-–—]+$/, "").trim();
}

function singular(k: string): string {
  if (k.endsWith("ies") && k.length > 4) return k.slice(0, -3) + "y";
  if (k.endsWith("sses")) return k.slice(0, -2);
  if (k.endsWith("s") && !k.endsWith("ss") && k.length > 3) return k.slice(0, -1);
  return k;
}

/** Rule F — tag hygiene, rule C — filler removal, rule E — count cap. */
function cleanKeywords(raw: string[], max: number, notes: string[], pid: string, contentType: ContentType): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const filler = new Set(FILLER_TERMS.map((f) => f.toLowerCase()));
  const templateOnly = new Set(TEMPLATE_ONLY_TERMS);
  let removedFiller = 0;
  let removedTemplate = 0;
  for (const r of raw) {
    let k = r.toLowerCase().replace(/^#+/, "").replace(/[^\p{L}\p{N}\s\-&']/gu, " ").replace(/\s+/g, " ").trim();
    if (!k || /^\d+$/.test(k)) continue;
    if (k.split(" ").length > 3) k = k.split(" ").slice(0, 3).join(" ");
    if (filler.has(k)) {
      removedFiller++;
      continue;
    }
    if (contentType === "template_pack") k = applyReplaceableText(k);
    if (contentType === "single_asset" && templateOnly.has(k)) {
      removedTemplate++;
      continue;
    }
    const key = k.split(" ").map(singular).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  if (removedFiller) notes.push(`${pid}: removed ${removedFiller} filler keyword(s) (rule C)`);
  if (removedTemplate) notes.push(`${pid}: removed ${removedTemplate} template-pack keyword(s) from a single asset (rule D)`);
  if (out.length > max) {
    notes.push(`${pid}: trimmed keywords ${out.length} → ${max} (rule E)`);
    return out.slice(0, max);
  }
  return out;
}

function normalizeFlag(f: string): string {
  const s = f.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (/vector|eps|\bai_file|illustrator/.test(s)) return "possible_vector";
  if (/text|typograph/.test(s) && !/texture/.test(s)) return "contains_text";
  return s;
}

function matchCategory(cat: string, allowed: string[], fallback: string): string {
  const c = cat.trim().toLowerCase();
  const exact = allowed.find((a) => a.toLowerCase() === c);
  if (exact) return exact;
  const partial = allowed.find((a) => a.toLowerCase().includes(c) || c.includes(a.toLowerCase()));
  return partial ?? fallback;
}

export interface OverLimitTitle {
  platform: PlatformId;
  original: string;
  max: number;
}

export interface EnforceResult {
  result: MetadataResult;
  notes: string[];
  /** Titles the model produced over the ceiling (already repaired deterministically; caller may ask the model for a better rewrite). */
  overLimit: OverLimitTitle[];
}

const TEMPLATE_KIND_RE = /\b(templates?|posters?|covers?|banners?|flyers?|fliers?|layouts?|brochures?|set|collection|mockups?)\b/i;

/** Filler strip + (template packs) replaceable-text swap. */
export function cleanText(text: string, isTemplate: boolean): string {
  const t = stripFiller(text.trim());
  return isTemplate ? applyReplaceableText(t) : t;
}

/** Accept a model-rewritten title only if it fits and (for template packs) still names the template kind. */
export function acceptRewrittenTitle(title: unknown, max: number, isTemplate: boolean): string | null {
  if (typeof title !== "string") return null;
  const t = cleanText(title, isTemplate).replace(/\s+/g, " ");
  if (t.length < 20 || t.length > max) return null;
  if (isTemplate && !TEMPLATE_KIND_RE.test(t)) return null;
  return t;
}

/** Phase 2 — deterministic enforcement of rules A–K on a schema-valid object. */
export function enforceRules(data: unknown, hint: ContentTypeHint): EnforceResult {
  checkSchema(data);
  const d = data as MetadataResult & { platforms: Record<PlatformId, Partial<PlatformMeta>> };
  const notes: string[] = [];

  let contentType: ContentType = d.content_type;
  if (hint !== "auto" && hint !== contentType) {
    notes.push(`content_type overridden ${contentType} → ${hint} (user hint is authoritative)`);
    contentType = hint;
  }
  const isTemplate = contentType === "template_pack";

  let flags = Array.from(new Set(d.flags.map(normalizeFlag).filter(Boolean)));
  let description = stripFiller(d.description.trim());
  if (isTemplate) description = applyReplaceableText(description);

  const platforms = {} as Record<PlatformId, PlatformMeta>;
  const overLimit: OverLimitTitle[] = [];
  for (const spec of PLATFORMS) {
    const m = d.platforms[spec.id];
    let title = stripFiller(String(m.title));
    let pdesc = stripFiller(String(m.description ?? "").trim() || description);
    if (isTemplate) {
      const beforeT = title;
      const beforeD = pdesc;
      title = applyReplaceableText(title);
      pdesc = applyReplaceableText(pdesc);
      if (beforeT !== title || beforeD !== pdesc) notes.push(`${spec.id}: "editable text" → "replaceable text" (rule J)`);
    }
    if (spec.id === "shutterstock") {
      // Shutterstock has one description field that doubles as the title.
      pdesc = title;
    }
    if (title.length > spec.titleMax) {
      overLimit.push({ platform: spec.id, original: title, max: spec.titleMax });
      // Prefer a sibling platform's title that already fits (keeps a complete sentence) over blind truncation.
      const sibling = PLATFORMS.filter((s) => s.id !== spec.id)
        .map((s) => ({ id: s.id, t: cleanText(String(d.platforms[s.id]?.title ?? ""), isTemplate) }))
        .filter((c) => c.t.length >= 30 && c.t.length <= spec.titleMax && (!isTemplate || TEMPLATE_KIND_RE.test(c.t)))
        .sort((a, b) => b.t.length - a.t.length)[0];
      if (sibling) {
        notes.push(`${spec.id}: title ${title.length} chars > ${spec.titleMax}; used fitting ${sibling.id} title instead (rule ${isTemplate ? "H" : "G"})`);
        title = sibling.t;
      } else {
        const fitted = fitTitle(title, spec.titleMax);
        notes.push(`${spec.id}: title ${title.length} → ${fitted.length} chars (truncated) to fit ≤${spec.titleMax} (rule ${isTemplate ? "H" : "G"})`);
        title = fitted;
      }
      if (spec.id === "shutterstock") pdesc = title;
    }
    if (pdesc.length > spec.descriptionMax) pdesc = fitTitle(pdesc, spec.descriptionMax);

    let keywords = cleanKeywords(m.keywords as string[], spec.keywordsMax, notes, spec.id, contentType);

    // Rule I — ensure a design-purpose layer exists for template packs.
    if (isTemplate) {
      const present = keywords.filter((k) => TEMPLATE_PURPOSE_TERMS.some((t) => k === t || k.includes(t)));
      if (present.length < 2) {
        const inject = ["template", "layout"].filter((t) => !keywords.includes(t));
        keywords = [...keywords.slice(0, 4), ...inject, ...keywords.slice(4)].slice(0, spec.keywordsMax);
        notes.push(`${spec.id}: added design-purpose keywords ${inject.join(", ")} (rule I)`);
      }
    }
    if (keywords.length < spec.keywordsMin) notes.push(`${spec.id}: only ${keywords.length} keywords (recommended ≥${spec.keywordsMin})`);

    // Categories — rule K for template packs.
    let category = String(m.category ?? "");
    if (spec.id === "adobe") category = matchCategory(category, Object.keys(ADOBE_CATEGORIES), "Graphic Resources");
    else if (spec.id === "shutterstock") category = matchCategory(category, SHUTTERSTOCK_CATEGORIES, isTemplate ? "Abstract" : "Backgrounds/Textures");
    else category = matchCategory(category, spec.categories, isTemplate ? spec.templateCategory : spec.backgroundCategory);
    if (isTemplate && category !== spec.templateCategory && /background|texture/i.test(category)) {
      notes.push(`${spec.id}: category ${category} → ${spec.templateCategory} (rule K)`);
      category = spec.templateCategory;
    }
    if (isTemplate && spec.id === "adobe" && category !== "Graphic Resources") {
      notes.push(`adobe: category ${category} → Graphic Resources (rule K)`);
      category = "Graphic Resources";
    }

    platforms[spec.id] = { title, description: pdesc, keywords, category };
  }

  let categorySuggestion = d.category_suggestion.trim();
  if (isTemplate && categorySuggestion !== "Graphic Resources") {
    notes.push(`category_suggestion "${categorySuggestion}" → "Graphic Resources" (rule K)`);
    categorySuggestion = "Graphic Resources";
  }
  if (!isTemplate && /graphic resources/i.test(categorySuggestion) === false && !categorySuggestion) {
    categorySuggestion = "Backgrounds/Textures";
  }
  if (!isTemplate) flags = flags.filter((f) => f !== "ambiguous_content_type" || hint === "auto");

  return {
    result: { content_type: contentType, description, platforms, category_suggestion: categorySuggestion, flags },
    notes,
    overLimit,
  };
}

export function getTitleLimit(pid: PlatformId) {
  return getPlatform(pid).titleMax;
}
