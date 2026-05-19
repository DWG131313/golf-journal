"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/library", label: "Library" },
  { href: "/topics", label: "Topics" },
  { href: "/ask", label: "Ask" },
  { href: "/upload", label: "Upload" },
];

// Routes whose URL parent isn't the nav link they belong under.
// `/lessons/[id]` lives at /lessons/ but conceptually descends from Library.
const aliasParent: Record<string, string> = {
  "/lessons": "/library",
};

type ActiveState = "exact" | "ancestor" | "none";

function activeState(pathname: string, href: string): ActiveState {
  if (pathname === href) return "exact";
  if (pathname.startsWith(href + "/")) return "ancestor";
  for (const [prefix, parent] of Object.entries(aliasParent)) {
    if (parent === href && (pathname === prefix || pathname.startsWith(prefix + "/"))) {
      return "ancestor";
    }
  }
  return "none";
}

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-baseline gap-7 text-sm uppercase tracking-[0.22em]">
      {links.map(({ href, label }) => {
        const state = activeState(pathname, href);
        const active = state !== "none";
        const ariaCurrent =
          state === "exact" ? "page" : state === "ancestor" ? "true" : undefined;
        return (
          <a
            key={href}
            href={href}
            aria-current={ariaCurrent}
            className={`transition-colors ${
              active ? "text-moss-300" : "text-stone-400 hover:text-stone-100"
            }`}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
