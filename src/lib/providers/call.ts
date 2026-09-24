import type { ResolvedProvider } from "./settings";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  /** data URL (data:image/jpeg;base64,...) — only on the first user turn. */
  image?: string;
}

function authHeaders(p: ResolvedProvider): Record<string, string> {
  const a = p.def.auth;
  if (a.type === "bearer") return { Authorization: `Bearer ${p.apiKey}` };
  if (a.type === "header") return { [a.header]: p.apiKey };
  return {};
}

function splitDataUrl(dataUrl: string): { mime: string; b64: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("Image must be a base64 data URL");
  return { mime: m[1], b64: m[2] };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 120_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Send a system prompt + conversation (with an image) to any registered provider; returns raw text. */
export async function callProvider(p: ResolvedProvider, system: string, turns: ChatTurn[], opts: { jsonMode?: boolean; maxTokens?: number } = {}): Promise<string> {
  if (!p.apiKey) throw new Error(`${p.def.label}: no API key configured (save one in Providers or set ${p.def.envKey})`);
  if (!p.baseUrl) throw new Error(`${p.def.label}: base URL not configured`);
  if (!p.model) throw new Error(`${p.def.label}: model ID not configured`);
  const maxTokens = opts.maxTokens ?? 3000;

  switch (p.def.wireFormat) {
    case "openai-chat-completions": {
      const messages = [
        { role: "system", content: system },
        ...turns.map((t) =>
          t.image
            ? { role: t.role, content: [{ type: "text", text: t.text }, { type: "image_url", image_url: { url: t.image } }] }
            : { role: t.role, content: t.text }
        ),
      ];
      const body: Record<string, unknown> = { model: p.model, messages, max_tokens: maxTokens, temperature: 0.3 };
      if (opts.jsonMode) body.response_format = { type: "json_object" };
      let data;
      try {
        data = await postJson(`${p.baseUrl}/chat/completions`, authHeaders(p), body);
      } catch (e) {
        // Some gateways reject response_format — retry once without it.
        if (opts.jsonMode && /response_format|json_object/i.test((e as Error).message)) {
          delete body.response_format;
          data = await postJson(`${p.baseUrl}/chat/completions`, authHeaders(p), body);
        } else throw e;
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) return content.map((c: { text?: string }) => c.text ?? "").join("");
      throw new Error("Empty completion from provider");
    }
    case "anthropic-messages": {
      const messages = turns.map((t) => {
        if (!t.image) return { role: t.role, content: t.text };
        const { mime, b64 } = splitDataUrl(t.image);
        return {
          role: t.role,
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text: t.text },
          ],
        };
      });
      const data = await postJson(
        `${p.baseUrl}/messages`,
        { ...authHeaders(p), "anthropic-version": "2023-06-01" },
        { model: p.model, system, messages, max_tokens: maxTokens, temperature: 0.3 }
      );
      const text = (data?.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
      if (!text) throw new Error("Empty response from Anthropic");
      return text;
    }
    case "gemini-generate-content": {
      const contents = turns.map((t) => {
        const parts: unknown[] = [];
        if (t.image) {
          const { mime, b64 } = splitDataUrl(t.image);
          parts.push({ inline_data: { mime_type: mime, data: b64 } });
        }
        parts.push({ text: t.text });
        return { role: t.role === "assistant" ? "model" : "user", parts };
      });
      const data = await postJson(`${p.baseUrl}/models/${encodeURIComponent(p.model)}:generateContent`, authHeaders(p), {
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens, ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}) },
      });
      const text = (data?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
      if (!text) throw new Error(`Empty response from Gemini${data?.promptFeedback ? `: ${JSON.stringify(data.promptFeedback)}` : ""}`);
      return text;
    }
  }
}
