import Link from "next/link";

const navItems = [
  { href: "/lessons", label: "Lessons" },
  { href: "/topics", label: "Topics" },
  { href: "/search", label: "Search" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold text-lg">
          Golf Coach KB
        </Link>
        <div className="flex gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
