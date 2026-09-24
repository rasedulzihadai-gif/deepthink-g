"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLATFORMS, PlatformId, ContentTypeHint } from "@/lib/platforms";
import { processImage, downloadText } from "@/lib/client/image";
import { VirtualList } from "./VirtualList";
import { ProviderPanel } from "./ProviderPanel";
import { AssetDetail, ContentTypeBadge } from "./AssetDetail";
import type { AssetItem, ProviderInfo } from "./types";

const CONCURRENCY = 3;
const HINTS: { v: ContentTypeHint; label: string; sub: string }[] = [
  { v: "auto", label: "Auto", sub: "vision model decides" },
  { v: "single_asset", label: "Single background", sub: "rules A–G" },
  { v: "template_pack", label: "Template / design pack", sub: "rules A–F + H–K" },
];

export default function App() {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultProvider, setDefaultProvider] = useState("deepseek");
  const [providerId, setProviderId] = useState("deepseek");
  const [showProviders, setShowProviders] = useState(false);
  const [hint, setHint] = useState<ContentTypeHint>("auto");
  const [autoRun, setAutoRun] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState<"all" | "single_asset" | "template_pack" | "error" | "pending">("all");
  const [query, setQuery] = useState("");
  const [truncAdobe, setTruncAdobe] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ title: string; warnings: string[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const queue = useRef<number[]>([]);
  const running = useRef(0);
  const providerRef = useRef(providerId);
  providerRef.current = providerId;
  const fileInput = useRef<HTMLInputElement>(null);

  const upsert = useCallback((a: AssetItem) => setAssets((prev) => prev.map((x) => (x.id === a.id ? a : x))), []);
  const setStatus = useCallback((id: number, status: AssetItem["status"]) => setAssets((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x))), []);

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then((d) => setAssets(d.assets ?? []));
    fetch("/api/providers").then((r) => r.json()).then((d) => {
      setProviders(d.providers ?? []);
      setDefaultProvider(d.defaultProvider);
      setProviderId(d.defaultProvider);
    });
  }, []);

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY && queue.current.length) {
      const id = queue.current.shift()!;
      running.current++;
      setStatus(id, "processing");
      fetch(`/api/assets/${id}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: providerRef.current }) })
        .then((r) => r.json())
        .then((d) => d.asset && upsert(d.asset))
        .catch((e) => setToast(String(e)))
        .finally(() => {
          running.current--;
          pump();
        });
    }
  }, [setStatus, upsert]);

  const enqueue = useCallback((ids: number[]) => {
    const fresh = ids.filter((id) => !queue.current.includes(id));
    queue.current.push(...fresh);
    setAssets((prev) => prev.map((x) => (fresh.includes(x.id) ? { ...x, status: "queued" } : x)));
    pump();
  }, [pump]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const skipped = Array.from(files).length - list.length;
    if (skipped) setToast(`${skipped} non-image file(s) skipped — upload the JPEG/PNG preview of vector files.`);
    setUploading((n) => n + list.length);
    const created: number[] = [];
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const f = list[idx++];
        try {
          const img = await processImage(f);
          const res = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: f.name, contentTypeHint: hint, ...img }) });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error);
          setAssets((prev) => [d.asset, ...prev]);
          created.push(d.asset.id);
          if (autoRun) enqueue([d.asset.id]);
        } catch (e) {
          setToast(`${f.name}: ${(e as Error).message}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (created.length && selectedId === null) setSelectedId(created[0]);
  }

  async function patch(id: number, body: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/assets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) return d.error || "Update failed";
    upsert(d.asset);
    return null;
  }

  async function remove(id: number) {
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function clearAll() {
    if (!confirm("Delete all assets and metadata?")) return;
    await fetch("/api/assets", { method: "DELETE" });
    setAssets([]);
    setSelectedId(null);
  }

  async function makeDefault(id: string) {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultProvider: id }) });
    setDefaultProvider(id);
    setProviderId(id);
  }

  async function exportCsv(platform: PlatformId) {
    const unconfirmed = assets.filter((a) => a.result?.content_type === "template_pack" && a.result.flags.includes("possible_vector") && a.fileType === "unknown");
    if (unconfirmed.length && !confirm(`${unconfirmed.length} template pack(s) look like vectors but the real file type (AI/EPS vs JPEG) isn't confirmed. Export anyway with original extensions?`)) {
      setFilter("template_pack");
      setSelectedId(unconfirmed[0].id);
      return;
    }
    const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, truncateAdobeNames: truncAdobe }) });
    const d = await res.json();
    if (!res.ok) return setToast(d.error);
    downloadText(d.filename, d.csv);
    setExportMsg({ title: `Exported ${d.count} rows → ${d.filename}`, warnings: d.warnings });
  }

  const counts = useMemo(() => {
    const c = { total: assets.length, done: 0, error: 0, busy: 0, single: 0, template: 0, pending: 0 };
    for (const a of assets) {
      if (a.status === "done") c.done++;
      else if (a.status === "error") c.error++;
      else if (a.status === "processing" || a.status === "queued") c.busy++;
      else c.pending++;
      if (a.result?.content_type === "single_asset") c.single++;
      if (a.result?.content_type === "template_pack") c.template++;
    }
    return c;
  }, [assets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (q && !a.filename.toLowerCase().includes(q) && !a.result?.platforms.adobe.title.toLowerCase().includes(q)) return false;
      if (filter === "error") return a.status === "error";
      if (filter === "pending") return a.status === "pending";
      if (filter === "single_asset" || filter === "template_pack") return a.result?.content_type === filter;
      return true;
    });
  }, [assets, filter, query]);

  const selected = assets.find((a) => a.id === selectedId) ?? null;
  const currentProvider = providers.find((p) => p.id === providerId);

  return (
    <div
      className="flex h-screen flex-col bg-zinc-950 text-zinc-200"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
    >
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/10 px-5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-black text-zinc-950">M</div>
          <span className="font-semibold tracking-tight text-zinc-100">Metastock</span>
          <span className="hidden text-xs text-zinc-500 sm:inline">content-type-aware microstock metadata</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${currentProvider?.configured ? "bg-emerald-400" : "bg-amber-400"}`} />
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="bg-transparent text-zinc-100 outline-none">
              {providers.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900">
                  {p.label}{p.id === defaultProvider ? " (default)" : ""}{p.configured ? "" : " — not configured"}
                </option>
              ))}
            </select>
            <span className="hidden font-mono text-[10px] text-zinc-500 md:inline">{currentProvider?.model}</span>
          </label>
          <button onClick={() => setShowProviders(true)} className="btn-ghost">Providers</button>
        </div>
      </header>
      {currentProvider && !currentProvider.configured && (
        <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-xs text-amber-200">
          {currentProvider.label} has no API key yet. Add one in Providers (or set <code>{currentProvider.envKey}</code>) to generate metadata.
          <button onClick={() => setShowProviders(true)} className="underline">Configure</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 p-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Content type for new uploads</p>
            <div className="space-y-1">
              {HINTS.map((h) => (
                <button key={h.v} onClick={() => setHint(h.v)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${hint === h.v ? "border-emerald-500/50 bg-emerald-500/10 text-zinc-100" : "border-white/10 text-zinc-400 hover:border-white/20"}`}>
                  <span className="font-medium">{h.label}</span>
                  <span className="text-[10px] text-zinc-500">{h.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => fileInput.current?.click()} className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${drag ? "border-emerald-400 bg-emerald-500/10" : "border-white/15 hover:border-white/30"}`}>
            <p className="text-sm font-medium text-zinc-200">{uploading ? `Processing ${uploading}…` : "Drop previews or click"}</p>
            <p className="mt-1 text-[11px] text-zinc-500">JPEG / PNG / WebP · vector packs: upload the JPEG preview</p>
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} className="accent-emerald-500" />
            Generate automatically after upload
          </label>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat n={counts.done} label="done" />
            <Stat n={counts.busy} label="running" />
            <Stat n={counts.error} label="errors" tone={counts.error ? "text-red-400" : undefined} />
          </div>
          <div className="flex gap-2">
            <button disabled={!counts.pending} onClick={() => enqueue(assets.filter((a) => a.status === "pending").map((a) => a.id))} className="btn-ghost flex-1">Run pending</button>
            <button disabled={!counts.error} onClick={() => enqueue(assets.filter((a) => a.status === "error").map((a) => a.id))} className="btn-ghost flex-1">Retry errors</button>
          </div>

          <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Export CSV ({counts.done})</p>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} disabled={!counts.done} onClick={() => exportCsv(p.id)} className="btn-ghost" title={p.csvNote}>{p.label}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <input type="checkbox" checked={truncAdobe} onChange={(e) => setTruncAdobe(e.target.checked)} className="accent-emerald-500" />
              Truncate Adobe filenames to 30 chars
            </label>
            <button onClick={clearAll} disabled={!assets.length} className="w-full text-[11px] text-zinc-600 hover:text-red-400">Clear all assets</button>
          </div>
        </aside>

        {/* List */}
        <section className="flex min-w-0 flex-1 flex-col border-r border-white/10">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
            {([
              ["all", `All ${counts.total}`],
              ["single_asset", `Single ${counts.single}`],
              ["template_pack", `Templates ${counts.template}`],
              ["pending", `Pending ${counts.pending}`],
              ["error", `Errors ${counts.error}`],
            ] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`rounded-md px-2 py-1 text-xs ${filter === v ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{l}</button>
            ))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="ml-auto w-40 rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs outline-none focus:border-emerald-500/50" />
          </div>
          {visible.length === 0 ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <p className="text-sm text-zinc-300">{assets.length ? "Nothing matches this filter." : "No assets yet."}</p>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">Upload single backgrounds and template/poster packs. Each is classified first, then gets metadata written the way top-ranking listings of that type are written.</p>
              </div>
            </div>
          ) : (
            <VirtualList
              className="flex-1"
              items={visible}
              rowHeight={76}
              renderRow={(a) => (
                <div onClick={() => setSelectedId(a.id)} className={`group mx-2 my-1 flex h-[68px] cursor-pointer items-center gap-3 rounded-lg px-2 transition ${a.id === selectedId ? "bg-white/10" : "hover:bg-white/[0.04]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbData} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-md bg-zinc-800 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs text-zinc-300">{a.filename}</span>
                      {a.filename.length > 30 && <span title="Over Adobe's 30-char CSV filename cap" className="shrink-0 text-[10px] text-amber-400">30+</span>}
                    </div>
                    <p className="truncate text-xs text-zinc-500">{a.status === "error" ? <span className="text-red-400">{a.error}</span> : a.result?.platforms.adobe.title ?? (a.contentTypeHint !== "auto" ? `hint: ${a.contentTypeHint}` : "awaiting generation")}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <ContentTypeBadge type={a.result?.content_type} />
                      {a.result?.flags.includes("possible_vector") && a.fileType === "unknown" && <span className="text-[10px] text-amber-400">confirm file type</span>}
                    </div>
                  </div>
                  <StatusDot status={a.status} />
                  <button onClick={(e) => { e.stopPropagation(); remove(a.id); }} className="hidden text-xs text-zinc-600 hover:text-red-400 group-hover:block">✕</button>
                </div>
              )}
            />
          )}
        </section>

        {/* Detail */}
        <section className="hidden w-[440px] shrink-0 p-4 lg:block">
          {selected ? (
            <AssetDetail key={selected.id} asset={selected} onPatch={(b) => patch(selected.id, b)} onRegenerate={() => enqueue([selected.id])} />
          ) : (
            <div className="grid h-full place-items-center text-center text-xs text-zinc-500">Select an asset to review and edit its metadata.</div>
          )}
        </section>
      </div>

      {showProviders && (
        <ProviderPanel providers={providers} defaultProvider={defaultProvider} onClose={() => setShowProviders(false)} onProviders={setProviders} onDefault={makeDefault} />
      )}

      {exportMsg && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setExportMsg(null)}>
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium text-zinc-100">{exportMsg.title}</p>
            {exportMsg.warnings.length ? (
              <ul className="mt-3 max-h-72 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-amber-300">{exportMsg.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-400">No warnings.</p>
            )}
            <button onClick={() => setExportMsg(null)} className="btn-primary mt-4">OK</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-xs text-zinc-200 shadow-xl" onClick={() => setToast(null)}>
          {toast} <span className="ml-2 text-zinc-500">✕</span>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] py-2">
      <p className={`text-lg font-semibold ${tone ?? "text-zinc-100"}`}>{n}</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

function StatusDot({ status }: { status: AssetItem["status"] }) {
  const map: Record<string, string> = {
    pending: "bg-zinc-600",
    queued: "bg-sky-400/60",
    processing: "bg-sky-400 animate-pulse",
    done: "bg-emerald-400",
    error: "bg-red-500",
  };
  return <span title={status} className={`h-2 w-2 shrink-0 rounded-full ${map[status]}`} />;
}
