"use client";

import { useEffect, useState } from "react";
import { PLATFORMS, PlatformId, MetadataResult, ContentTypeHint, FileType, TEMPLATE_PURPOSE_TERMS } from "@/lib/platforms";
import type { AssetItem } from "./types";

const HINT_OPTS: { v: ContentTypeHint; label: string }[] = [
  { v: "auto", label: "Auto-detect" },
  { v: "single_asset", label: "Single background" },
  { v: "template_pack", label: "Template / design pack" },
];

export function ContentTypeBadge({ type }: { type?: string | null }) {
  if (type === "template_pack") return <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">Template pack</span>;
  if (type === "single_asset") return <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">Single asset</span>;
  return null;
}

export function AssetDetail({
  asset,
  onPatch,
  onRegenerate,
}: {
  asset: AssetItem;
  onPatch: (body: Record<string, unknown>) => Promise<string | null>;
  onRegenerate: () => void;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [tab, setTab] = useState<PlatformId>("adobe");
  const [draft, setDraft] = useState<MetadataResult | null>(asset.result);
  const [kwText, setKwText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setFull(null);
    fetch(`/api/assets/${asset.id}`)
      .then((r) => r.json())
      .then((d) => !cancel && setFull(d.asset?.imageData ?? null));
    return () => {
      cancel = true;
    };
  }, [asset.id]);

  useEffect(() => {
    setDraft(asset.result);
    setKwText(Object.fromEntries(PLATFORMS.map((p) => [p.id, asset.result?.platforms[p.id]?.keywords.join(", ") ?? ""])));
    setErr(null);
  }, [asset.result, asset.id]);

  const r = asset.result;
  const spec = PLATFORMS.find((p) => p.id === tab)!;
  const pm = draft?.platforms[tab];
  const dirty = JSON.stringify(draft) !== JSON.stringify(r) || PLATFORMS.some((p) => kwText[p.id] !== (r?.platforms[p.id]?.keywords.join(", ") ?? ""));
  const needsFileType = r?.content_type === "template_pack" && r.flags.includes("possible_vector") && asset.fileType === "unknown";

  function setField(field: "title" | "description" | "category", value: string) {
    if (!draft) return;
    setDraft({ ...draft, platforms: { ...draft.platforms, [tab]: { ...draft.platforms[tab], [field]: value } } });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    const next: MetadataResult = {
      ...draft,
      platforms: Object.fromEntries(
        PLATFORMS.map((p) => [p.id, { ...draft.platforms[p.id], keywords: (kwText[p.id] ?? "").split(",").map((k) => k.trim()).filter(Boolean) }])
      ) as MetadataResult["platforms"],
    };
    const e = await onPatch({ result: next });
    setErr(e);
    setSaving(false);
  }

  const kwList = (kwText[tab] ?? "").split(",").map((k) => k.trim()).filter(Boolean);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[repeating-conic-gradient(#18181b_0%_25%,#27272a_0%_50%)] bg-[length:20px_20px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={full ?? asset.thumbData} alt={asset.filename} className="h-full w-full object-contain" />
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-zinc-200" title={asset.filename}>{asset.filename}</p>
          <p className="text-[11px] text-zinc-500">
            {asset.width}×{asset.height}
            {asset.palette?.length ? ` · measured: ${asset.palette.join(", ")}` : ""}
            {asset.model ? ` · ${asset.providerId}/${asset.model}` : ""}
          </p>
        </div>
        <button onClick={onRegenerate} disabled={asset.status === "processing" || asset.status === "queued"} className="btn-ghost shrink-0">
          {asset.status === "processing" ? "Generating…" : r ? "Regenerate" : "Generate"}
        </button>
      </div>

      {/* Content type */}
      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Content type</span>
          {r && (
            <span className="flex items-center gap-2 text-[11px] text-zinc-400">
              {asset.contentTypeHint === "auto" ? "detected" : "hinted"} <ContentTypeBadge type={r.content_type} />
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
          {HINT_OPTS.map((o) => (
            <button
              key={o.v}
              onClick={() => onPatch({ contentTypeHint: o.v })}
              className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition ${asset.contentTypeHint === o.v ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {r && asset.contentTypeHint !== "auto" && asset.contentTypeHint !== r.content_type && (
          <p className="mt-2 text-[11px] text-amber-300">Hint changed — regenerate to apply the {asset.contentTypeHint === "template_pack" ? "H–K" : "A–G"} rule set.</p>
        )}
      </section>

      {asset.status === "error" && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 break-words">{asset.error}</p>}

      {needsFileType && (
        <section className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-medium text-amber-200">This looks like vector artwork. What is the real file you’ll upload?</p>
          <p className="mt-0.5 text-[11px] text-amber-200/70">The model only sees a JPEG preview. The export filename extension follows your answer.</p>
          <div className="mt-2 flex gap-2">
            {(["eps", "ai", "jpeg"] as FileType[]).map((t) => (
              <button key={t} onClick={() => onPatch({ fileType: t })} className="btn-ghost uppercase">{t === "jpeg" ? "JPEG only" : `${t} + JPEG`}</button>
            ))}
          </div>
        </section>
      )}

      {r && draft && pm && (
        <>
          <section className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">Category suggestion</p>
              <p className="mt-1 font-medium text-zinc-100">{r.category_suggestion}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">File type</p>
              <select value={asset.fileType} onChange={(e) => onPatch({ fileType: e.target.value })} className="mt-1 w-full rounded bg-transparent text-zinc-100 outline-none">
                <option value="unknown" className="bg-zinc-900">Unconfirmed</option>
                <option value="jpeg" className="bg-zinc-900">JPEG</option>
                <option value="png" className="bg-zinc-900">PNG</option>
                <option value="eps" className="bg-zinc-900">EPS (vector)</option>
                <option value="ai" className="bg-zinc-900">AI (vector)</option>
              </select>
            </div>
          </section>
          {r.flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {r.flags.map((f) => (
                <span key={f} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">{f}</span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">{r.description}</p>

          <div className="mt-3 flex gap-1 border-b border-white/10">
            {PLATFORMS.map((p) => (
              <button key={p.id} onClick={() => setTab(p.id)} className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${tab === p.id ? "border-emerald-400 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-3 py-3">
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-zinc-500">
                <span>{tab === "shutterstock" ? "Description (title)" : "Title"}</span>
                <span className={pm.title.length > spec.titleMax ? "text-red-400" : "text-zinc-500"}>{pm.title.length}/{spec.titleMax}</span>
              </span>
              <textarea rows={2} value={pm.title} onChange={(e) => setField("title", e.target.value)} className="input resize-none" />
            </label>
            {tab !== "shutterstock" && (
              <label className="block">
                <span className="mb-1 flex justify-between text-[11px] text-zinc-500"><span>Description</span><span>{pm.description.length}/{spec.descriptionMax}</span></span>
                <textarea rows={2} value={pm.description} onChange={(e) => setField("description", e.target.value)} className="input resize-none" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-zinc-500">
                <span>Keywords (comma-separated, most important first)</span>
                <span className={kwList.length > spec.keywordsMax || kwList.length < spec.keywordsMin ? "text-amber-400" : ""}>{kwList.length}/{spec.keywordsMax}</span>
              </span>
              <textarea rows={4} value={kwText[tab] ?? ""} onChange={(e) => setKwText({ ...kwText, [tab]: e.target.value })} className="input resize-none font-mono text-[11px]" />
            </label>
            <div className="flex flex-wrap gap-1">
              {kwList.map((k, i) => {
                const purpose = r.content_type === "template_pack" && TEMPLATE_PURPOSE_TERMS.some((t) => k === t || k.includes(t));
                return (
                  <span key={k + i} className={`rounded px-1.5 py-0.5 text-[10px] ${i < 10 ? "bg-emerald-500/15 text-emerald-200" : purpose ? "bg-violet-500/15 text-violet-200" : "bg-white/5 text-zinc-400"}`}>
                    {k}
                  </span>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-600">Green = top-10 weighted keywords{r.content_type === "template_pack" ? " · violet = design-purpose layer (rule I)" : ""}</p>
            <label className="block">
              <span className="mb-1 block text-[11px] text-zinc-500">Category</span>
              <select value={pm.category} onChange={(e) => setField("category", e.target.value)} className="input">
                {spec.categories.map((c) => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button disabled={!dirty || saving} onClick={save} className="btn-primary">{saving ? "Validating…" : "Save edits"}</button>
              {dirty && <span className="text-[11px] text-zinc-500">Edits pass through the same strict validator.</span>}
            </div>
            {err && <p className="text-xs text-red-400">{err}</p>}
          </div>

          {asset.validationNotes && asset.validationNotes.length > 0 && (
            <details className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11px] text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">Validation layer · {asset.validationNotes.length} note(s)</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-4">{asset.validationNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
