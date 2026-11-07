"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, House, List, Users } from "lucide-react";

const icons = { home: House, list: List, clock: Clock, users: Users };

export function NavLinks({ links }: { links: { href: string; label: string; icon: keyof typeof icons }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1 px-3 pb-2 lg:grid lg:px-3 lg:pb-0">
      {links.map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-canvas"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
