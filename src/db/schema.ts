import { pgTable, text, timestamp, boolean, jsonb, integer, serial } from "drizzle-orm/pg-core";

/** Per-provider configuration slot. One row per provider id in the registry. */
export const providerSettings = pgTable("provider_settings", {
  providerId: text("provider_id").primaryKey(),
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  model: text("model"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Simple key/value app settings (e.g. default provider). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** One uploaded asset (preview image) and its generated metadata. */
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  width: integer("width"),
  height: integer("height"),
  /** Downscaled JPEG data URL sent to the vision model. */
  imageData: text("image_data").notNull(),
  /** Small JPEG data URL for the list view. */
  thumbData: text("thumb_data").notNull(),
  /** Measured dominant colour names (computed client-side from pixels). */
  palette: jsonb("palette").$type<string[]>(),
  /** User hint: auto | single_asset | template_pack */
  contentTypeHint: text("content_type_hint").notNull().default("auto"),
  /** User-confirmed real file type for export: unknown | jpeg | eps | ai | png */
  fileType: text("file_type").notNull().default("unknown"),
  status: text("status").notNull().default("pending"), // pending | processing | done | error
  error: text("error"),
  providerId: text("provider_id"),
  model: text("model"),
  /** Validated metadata result (MetadataResult). */
  result: jsonb("result"),
  /** Validation-layer fix log. */
  validationNotes: jsonb("validation_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssetRow = typeof assets.$inferSelect;
export type ProviderSettingsRow = typeof providerSettings.$inferSelect;
