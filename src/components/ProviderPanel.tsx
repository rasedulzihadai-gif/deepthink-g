"use client";

import { useState } from "react";
import type { ProviderInfo } from "./types";

function ProviderCard({
  p,
  isDefault,
  onSaved,
  onMakeDefault,
}: {
  p: ProviderInfo;
  isDefault: boolean;
  onSaved: (list: ProviderInfo[]) => void;
  onMakeDefault: () => void;
}) {
  const [open, setOpen] = useState(isDefault);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [model, setModel] = useState(p.model);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, apiKey, baseUrl, model, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.providers);
      setApiKey("");
      setMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
    const data = await res.json();
    setMsg(data.ok ? { ok: true, text: `Connected · ${data.model} · ${data.latencyMs}ms` } : { ok: false, text: data.error });
    setBusy(false);
  }

  return (
    <div className={`rounded-xl border ${isDefault ? "border-emerald-500/50 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"}`}>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
        <span className={`h-2 w-2 rounded-full ${p.configured ? "bg-emerald-400" : "bg-zinc-600"}`} />
        <span className="flex-1 font-medium text-zinc-100">{p.label}</span>
        {isDefault && <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Default</span>}
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{p.kind}</span>
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/5 px-4 pb-4 pt-3 text-sm">
          <p className="text-xs leading-relaxed text-zinc-400">{p.notes}</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
            <span>Wire: <code className="text-zinc-300">{p.wireFormat}</code></span>
            <span>Key: {p.keySource === "none" ? <span className="text-amber-400">not set</span> : <span className="text-zinc-300">{p.keyPreview} ({p.keySource === "env" ? p.envKey : "saved"})</span>}</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">API key</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={p.keyPreview || `or set ${p.envKey}`} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Base URL</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={p.defaultBaseUrl || "https://gateway.example.com/v1"} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Model ID</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={p.defaultModel || "vision-capable model id"} className="input" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} onClick={() => save()} className="btn-primary">Save</button>
            <button disabled={busy} onClick={test} className="btn-ghost">Test connection</button>
            {p.keySource === "saved" && <button disabled={busy} onClick={() => save({ clearKey: true })} className="btn-ghost text-red-300">Clear key</button>}
            {!isDefault && <button onClick={onMakeDefault} className="btn-ghost">Make default</button>}
          </div>
          {msg && <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"} break-words`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

export function ProviderPanel({
  providers,
  defaultProvider,
  onClose,
  onProviders,
  onDefault,
}: {
  providers: ProviderInfo[];
  defaultProvider: string;
  onClose: () => void;
  onProviders: (p: ProviderInfo[]) => void;
  onDefault: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-zinc-950 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">AI providers</h2>
            <p className="text-xs text-zinc-500">Each slot is configured separately. Keys are stored server-side and never sent to the browser.</p>
          </div>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
        <div className="space-y-2">
          {providers.map((p) => (
            <ProviderCard key={p.id} p={p} isDefault={p.id === defaultProvider} onSaved={onProviders} onMakeDefault={() => onDefault(p.id)} />
          ))}
        </div>
      </aside>
    </div>
  );
}
