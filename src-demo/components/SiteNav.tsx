"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/library", label: "Library" },
  { href: "/topics", label: "Topics" },
  { href: "/ask", label: "Ask" },
];

// Routes whose URL parent isn't the nav link they belong under.
// `/lessons/[id]` lives at /lessons/ but conceptually descends from Library.
const aliasParent: Record<string, string> = {
  "/lessons": "/library",
};

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (pathname.startsWith(href + "/")) return true;
  for (const [prefix, parent] of Object.entries(aliasParent)) {
    if (parent === href && (pathname === prefix || pathname.startsWith(prefix + "/"))) {
      return true;
    }
  }
  return false;
}

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-baseline gap-7 text-xs uppercase tracking-[0.22em]">
      {links.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
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
