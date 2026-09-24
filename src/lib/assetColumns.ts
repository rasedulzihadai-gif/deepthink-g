import { assets } from "@/db/schema";

/** Columns for the list view — excludes the full-size image payload. */
export const listColumns = {
  id: assets.id,
  filename: assets.filename,
  width: assets.width,
  height: assets.height,
  thumbData: assets.thumbData,
  palette: assets.palette,
  contentTypeHint: assets.contentTypeHint,
  fileType: assets.fileType,
  status: assets.status,
  error: assets.error,
  providerId: assets.providerId,
  model: assets.model,
  result: assets.result,
  validationNotes: assets.validationNotes,
  createdAt: assets.createdAt,
};
