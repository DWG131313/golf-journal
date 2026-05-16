import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Coach Demo",
  description: "Personal coaching knowledge base — searchable lessons, topics, and drills.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
      </body>
    </html>
  );
}
