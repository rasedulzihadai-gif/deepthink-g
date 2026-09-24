import { ADOBE_CATEGORIES, FileType, MetadataResult, PlatformId } from "./platforms";

export interface ExportAsset {
  filename: string;
  fileType: FileType;
  result: MetadataResult;
}

export interface ExportOutput {
  csv: string;
  filename: string;
  warnings: string[];
}

const ADOBE_FILENAME_MAX = 30;

function dq(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}
function sq(v: string | number): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Swap the extension to match the user-confirmed real file type (vector packs are uploaded as .eps/.ai). */
export function exportFilename(name: string, fileType: FileType): string {
  const base = name.replace(/\.[^.]+$/, "");
  const ext = fileType === "eps" ? "eps" : fileType === "ai" ? "ai" : fileType === "png" ? "png" : fileType === "jpeg" ? "jpg" : name.split(".").pop() || "jpg";
  return `${base}.${ext}`;
}

export function adobeFilenameIssues(name: string): string | null {
  return name.length > ADOBE_FILENAME_MAX ? `"${name}" is ${name.length} chars (Adobe CSV cap is ${ADOBE_FILENAME_MAX}) — rename the file before upload or the row will not match.` : null;
}

export function buildCsv(platform: PlatformId, items: ExportAsset[], opts: { truncateAdobeNames?: boolean } = {}): ExportOutput {
  const warnings: string[] = [];
  const rows: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);

  for (const a of items) {
    if (a.result.content_type === "template_pack" && a.result.flags.includes("possible_vector") && a.fileType === "unknown") {
      warnings.push(`${a.filename}: flagged possible_vector but real file type not confirmed — exported with original extension.`);
    }
  }

  if (platform === "adobe") {
    rows.push(["Filename", "Title", "Keywords", "Category", "Releases"].map(dq).join(","));
    for (const a of items) {
      let name = exportFilename(a.filename, a.fileType);
      const issue = adobeFilenameIssues(name);
      if (issue) {
        if (opts.truncateAdobeNames) {
          const ext = name.slice(name.lastIndexOf("."));
          const cut = name.slice(0, ADOBE_FILENAME_MAX - ext.length) + ext;
          warnings.push(`${name} truncated to ${cut} — rename the actual file to match.`);
          name = cut;
        } else warnings.push(issue);
      }
      const m = a.result.platforms.adobe;
      rows.push([name, m.title, m.keywords.join(", "), ADOBE_CATEGORIES[m.category] ?? 8, ""].map(dq).join(","));
    }
    return { csv: rows.join("\r\n") + "\r\n", filename: `adobe-stock-${stamp}.csv`, warnings };
  }

  if (platform === "shutterstock") {
    rows.push(["Filename", "Description", "Keywords", "Categories", "Illustration", "Mature Content", "Editorial"].map(dq).join(","));
    for (const a of items) {
      const m = a.result.platforms.shutterstock;
      const isIllustration = a.result.content_type === "template_pack" || a.fileType === "eps" || a.fileType === "ai";
      rows.push([exportFilename(a.filename, a.fileType), m.description || m.title, m.keywords.join(","), m.category, isIllustration ? "yes" : "no", "no", "no"].map(dq).join(","));
    }
    return { csv: rows.join("\r\n") + "\r\n", filename: `shutterstock-${stamp}.csv`, warnings };
  }

  if (platform === "freepik") {
    rows.push(["File name", "Title", "Keywords"].map(sq).join(";"));
    for (const a of items) {
      const m = a.result.platforms.freepik;
      rows.push([exportFilename(a.filename, a.fileType), m.title, m.keywords.join(", ")].map(sq).join(";"));
    }
    return { csv: rows.join("\r\n") + "\r\n", filename: `freepik-${stamp}.csv`, warnings };
  }

  // iStock / Getty ESP
  warnings.push(
    "iStock/Getty: keywords are matched against Getty's controlled vocabulary on upload — unmatched terms may be dropped or require disambiguation in ESP."
  );
  rows.push(["file name", "created date", "description", "country", "brief code", "title", "keywords"].map(dq).join(","));
  for (const a of items) {
    const m = a.result.platforms.istock;
    rows.push([exportFilename(a.filename, a.fileType), "", m.description, "", "", m.title, m.keywords.join(",")].map(dq).join(","));
  }
  return { csv: rows.join("\r\n") + "\r\n", filename: `istock-getty-${stamp}.csv`, warnings };
}
