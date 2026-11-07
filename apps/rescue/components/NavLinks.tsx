"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/invoices", label: "Invoices" },
  { href: "/team", label: "Team" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {links.map(({ href, label }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-canvas"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
