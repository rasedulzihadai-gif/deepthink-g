export type WireFormat = "openai-chat-completions" | "anthropic-messages" | "gemini-generate-content";

export interface ProviderDef {
  id: string;
  label: string;
  wireFormat: WireFormat;
  /** Default base URL. Empty string = user must configure (gateway slots). */
  baseUrl: string;
  /** How the API key is sent. */
  auth: { type: "bearer" } | { type: "header"; header: string } | { type: "query"; param: string };
  model: string;
  /** Env var consulted when no key is saved in the UI. */
  envKey: string;
  kind: "direct" | "gateway";
  notes: string;
}

export const DEFAULT_PROVIDER_ID = "deepseek";

export const PROVIDERS: ProviderDef[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    wireFormat: "openai-chat-completions",
    baseUrl: "https://api.deepseek.com/v1",
    auth: { type: "bearer" },
    // GA Sept 10 2026 — native vision. Legacy "deepseek-v4-flash-vision-exp" routes to the same model.
    model: "deepseek-flash",
    envKey: "DEEPSEEK_API_KEY",
    kind: "direct",
    notes:
      "Primary/default. Native multimodal (OpenAI-style image_url). Weaker at dense small-text OCR — irrelevant for background/pattern/template analysis. ~$0.22 / 1M input tokens.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    wireFormat: "gemini-generate-content",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    auth: { type: "header", header: "x-goog-api-key" },
    model: "gemini-2.5-flash",
    envKey: "GEMINI_API_KEY",
    kind: "direct",
    notes: "Strong vision, native JSON mode via responseMimeType.",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    wireFormat: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    auth: { type: "header", header: "x-api-key" },
    model: "claude-sonnet-4-5",
    envKey: "ANTHROPIC_API_KEY",
    kind: "direct",
    notes: "Messages API with base64 image blocks.",
  },
  {
    id: "openai",
    label: "OpenAI",
    wireFormat: "openai-chat-completions",
    baseUrl: "https://api.openai.com/v1",
    auth: { type: "bearer" },
    model: "gpt-4.1-mini",
    envKey: "OPENAI_API_KEY",
    kind: "direct",
    notes: "Chat Completions with image_url + JSON response_format.",
  },
  {
    id: "xkiro",
    label: "xKiro (gateway)",
    wireFormat: "openai-chat-completions",
    baseUrl: "",
    auth: { type: "bearer" },
    model: "",
    envKey: "XKIRO_API_KEY",
    kind: "gateway",
    notes: "OpenAI-compatible gateway. Set base URL and a vision-capable model ID.",
  },
  {
    id: "vyce",
    label: "Vyce (gateway)",
    wireFormat: "openai-chat-completions",
    baseUrl: "",
    auth: { type: "bearer" },
    model: "",
    envKey: "VYCE_API_KEY",
    kind: "gateway",
    notes: "OpenAI-compatible gateway. Set base URL and a vision-capable model ID.",
  },
  {
    id: "helyx",
    label: "Helyx (gateway)",
    wireFormat: "openai-chat-completions",
    baseUrl: "",
    auth: { type: "bearer" },
    model: "",
    envKey: "HELYX_API_KEY",
    kind: "gateway",
    notes: "OpenAI-compatible gateway. Set base URL and a vision-capable model ID.",
  },
  {
    id: "agentrouter",
    label: "AgentRouter (gateway)",
    wireFormat: "openai-chat-completions",
    baseUrl: "https://agentrouter.org/v1",
    auth: { type: "bearer" },
    model: "",
    envKey: "AGENTROUTER_API_KEY",
    kind: "gateway",
    notes: "OpenAI-compatible gateway. Pick a vision-capable model ID.",
  },
  {
    id: "seekai",
    label: "SeekAi (gateway)",
    wireFormat: "openai-chat-completions",
    baseUrl: "",
    auth: { type: "bearer" },
    model: "",
    envKey: "SEEKAI_API_KEY",
    kind: "gateway",
    notes: "OpenAI-compatible gateway. Set base URL and a vision-capable model ID.",
  },
];

export function getProviderDef(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
