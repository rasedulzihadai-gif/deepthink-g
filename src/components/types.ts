import type { ContentTypeHint, FileType, MetadataResult } from "@/lib/platforms";

export interface AssetItem {
  id: number;
  filename: string;
  width: number | null;
  height: number | null;
  thumbData: string;
  palette: string[] | null;
  contentTypeHint: ContentTypeHint;
  fileType: FileType;
  status: "pending" | "queued" | "processing" | "done" | "error";
  error: string | null;
  providerId: string | null;
  model: string | null;
  result: MetadataResult | null;
  validationNotes: string[] | null;
  createdAt: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  wireFormat: string;
  kind: "direct" | "gateway";
  notes: string;
  envKey: string;
  defaultBaseUrl: string;
  defaultModel: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  keySource: "saved" | "env" | "none";
  keyPreview: string;
  configured: boolean;
}
