"use client";

export interface ProcessedImage {
  imageData: string;
  thumbData: string;
  width: number;
  height: number;
  palette: string[];
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Cannot decode ${file.name} — upload the JPEG/PNG preview (AI/EPS can't be previewed in a browser).`));
    };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

/** Map a pixel to a buyer-searchable colour name. */
export function colorName(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < 0.1) return "black";
  if (l > 0.93) return "white";
  if (s < 0.12) return l < 0.35 ? "dark gray" : l > 0.7 ? "light gray" : "gray";
  let base: string;
  if (h < 15 || h >= 345) base = "red";
  else if (h < 40) base = l < 0.35 ? "brown" : "orange";
  else if (h < 65) base = l < 0.4 ? "olive" : s > 0.5 && l < 0.6 ? "gold" : "yellow";
  else if (h < 160) base = "green";
  else if (h < 195) base = "teal";
  else if (h < 250) base = l < 0.3 ? "navy" : h < 210 ? "cyan" : "blue";
  else if (h < 290) base = "purple";
  else base = "pink";
  if (base === "cyan" && l < 0.35) base = "teal";
  if (l > 0.78 && s > 0.2 && base !== "gold") return `pastel ${base}`;
  if (l < 0.25 && !["navy", "brown", "olive"].includes(base)) return `dark ${base}`;
  return base;
}

function palette(c: HTMLCanvasElement): string[] {
  const s = document.createElement("canvas");
  s.width = 64;
  s.height = 64;
  const ctx = s.getContext("2d")!;
  ctx.drawImage(c, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const n = colorName(data[i], data[i + 1], data[i + 2]);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const total = data.length / 4;
  return [...counts.entries()]
    .filter(([, n]) => n / total >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

export async function processImage(file: File): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const main = draw(img, 1024);
  const thumb = draw(img, 176);
  return {
    imageData: main.toDataURL("image/jpeg", 0.86),
    thumbData: thumb.toDataURL("image/jpeg", 0.75),
    width: img.naturalWidth,
    height: img.naturalHeight,
    palette: palette(main),
  };
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
