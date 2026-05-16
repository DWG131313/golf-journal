import type { Metadata } from "next";
import { Instrument_Serif, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Instrument Serif — the editorial display serif. Single-axis, no quirky
// alternates (unlike Fraunces), italic is exquisite. Used for everything
// that wants to feel like print: page titles, dates, lesson headlines,
// pull quotes, citations.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif-display",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

// Geist — body sans. Modern, warm, clean. The whole UI defaults to this.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans-body",
  display: "swap",
});

// JetBrains Mono — timestamps, technical metadata, anything coordinate-shaped.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Golf Journal",
  description: "A personal coaching archive — searchable lessons, topics, and drills.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${geist.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans text-stone-100 antialiased">
        <nav className="sticky top-0 z-30 border-b border-stone-900/70 bg-stone-950/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-baseline justify-between px-6 py-4">
            <a
              href="/"
              className="font-serif text-lg leading-none text-stone-100 transition-colors hover:text-moss-300"
            >
              Golf Journal
            </a>
            <div className="flex items-baseline gap-7 text-[11px] uppercase tracking-[0.22em] text-stone-500">
              <a href="/library" className="transition-colors hover:text-stone-100">
                Library
              </a>
              <a href="/topics" className="transition-colors hover:text-stone-100">
                Topics
              </a>
              <a href="/ask" className="transition-colors hover:text-stone-100">
                Ask
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
