import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metastock — Microstock Metadata Generator",
  description: "Content-type-aware metadata for Adobe Stock, Shutterstock, Freepik and iStock. DeepSeek by default.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
