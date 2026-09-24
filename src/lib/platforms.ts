export type ContentType = "single_asset" | "template_pack";
export type ContentTypeHint = "auto" | ContentType;
export type PlatformId = "adobe" | "shutterstock" | "freepik" | "istock";
export type FileType = "unknown" | "jpeg" | "png" | "eps" | "ai";

export interface PlatformMeta {
  title: string;
  description: string;
  keywords: string[];
  category: string;
}

export interface MetadataResult {
  content_type: ContentType;
  description: string;
  platforms: Record<PlatformId, PlatformMeta>;
  category_suggestion: string;
  flags: string[];
}

export interface PlatformSpec {
  id: PlatformId;
  label: string;
  /** Real-world title ceiling we enforce (rule G / H). */
  titleMax: number;
  /** Platform hard limit, informational. */
  titleHard: number;
  descriptionMax: number;
  keywordsMin: number;
  keywordsMax: number;
  categories: string[];
  templateCategory: string;
  backgroundCategory: string;
  csvNote: string;
}

export const ADOBE_CATEGORIES: Record<string, number> = {
  Animals: 1,
  "Buildings and Architecture": 2,
  Business: 3,
  Drinks: 4,
  "The Environment": 5,
  "States of Mind": 6,
  Food: 7,
  "Graphic Resources": 8,
  "Hobbies and Leisure": 9,
  Industry: 10,
  Landscapes: 11,
  Lifestyle: 12,
  People: 13,
  "Plants and Flowers": 14,
  "Culture and Religion": 15,
  Science: 16,
  "Social Issues": 17,
  Sports: 18,
  Technology: 19,
  Transport: 20,
  Travel: 21,
};

export const SHUTTERSTOCK_CATEGORIES = [
  "Abstract", "Animals/Wildlife", "Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks",
  "Business/Finance", "Celebrities", "Education", "Food and drink", "Healthcare/Medical", "Holidays",
  "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects", "Parks/Outdoor", "People", "Religion",
  "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage",
];

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "adobe",
    label: "Adobe Stock",
    titleMax: 70,
    titleHard: 200,
    descriptionMax: 200,
    keywordsMin: 25,
    keywordsMax: 49,
    categories: Object.keys(ADOBE_CATEGORIES),
    templateCategory: "Graphic Resources",
    backgroundCategory: "Graphic Resources",
    csvNote: "Comma-delimited, double-quoted. Filenames over 30 characters are flagged.",
  },
  {
    id: "shutterstock",
    label: "Shutterstock",
    titleMax: 200,
    titleHard: 200,
    descriptionMax: 200,
    keywordsMin: 25,
    keywordsMax: 50,
    categories: SHUTTERSTOCK_CATEGORIES,
    templateCategory: "Abstract",
    backgroundCategory: "Backgrounds/Textures",
    csvNote: "Comma-delimited, double-quoted. Description doubles as title.",
  },
  {
    id: "freepik",
    label: "Freepik",
    titleMax: 70,
    titleHard: 100,
    descriptionMax: 200,
    keywordsMin: 15,
    keywordsMax: 50,
    categories: ["Backgrounds", "Textures", "Templates", "Illustrations", "Photos", "Vectors"],
    templateCategory: "Templates",
    backgroundCategory: "Backgrounds",
    csvNote: "Semicolon-delimited, single-quoted.",
  },
  {
    id: "istock",
    label: "iStock / Getty",
    titleMax: 100,
    titleHard: 100,
    descriptionMax: 250,
    keywordsMin: 10,
    keywordsMax: 50,
    categories: ["Backgrounds", "Textures", "Graphic Resources", "Illustrations", "Photos"],
    templateCategory: "Graphic Resources",
    backgroundCategory: "Backgrounds",
    csvNote:
      "Keywords are mapped to Getty's controlled vocabulary in ESP — terms without a vocabulary match may be dropped or need disambiguation after upload.",
  },
];

export const PLATFORM_IDS: PlatformId[] = PLATFORMS.map((p) => p.id);

export function getPlatform(id: PlatformId): PlatformSpec {
  return PLATFORMS.find((p) => p.id === id)!;
}

/** Rule C — filler words/phrases that must never appear. */
export const FILLER_TERMS = [
  "beautiful", "stunning", "amazing", "awesome", "gorgeous", "perfect", "nice", "cool", "best",
  "high quality", "high-quality", "hd", "4k", "8k", "hq", "stock", "stock photo", "stock image",
  "image of", "photo of", "picture of", "royalty free", "royalty-free", "unique", "incredible",
];

/** Rule I — design-purpose pool for template_pack. */
export const TEMPLATE_PURPOSE_TERMS = [
  "template", "poster", "layout", "cover", "flier", "booklet", "banner", "collection", "set",
  "presentation", "mockup", "print", "editable design", "vector template", "business card", "brochure",
];

/** Rule B — use-case pool (applies to both types). */
export const USE_CASE_TERMS = [
  "background", "backdrop", "wallpaper", "banner", "website", "web", "presentation", "social media",
  "card", "cover", "header", "copy space", "poster", "flyer", "print", "digital", "screen", "design",
];

/** Terms that belong to template packs only — contradict a single_asset listing (rule D). */
export const TEMPLATE_ONLY_TERMS = [
  "template", "templates", "mockup", "mock up", "booklet", "flier", "brochure", "business card",
  "vector template", "template set", "poster templates", "editable design",
];
