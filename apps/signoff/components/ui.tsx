import Link from "next/link";
import { initials } from "@/lib/format";

const statusStyle: Record<string, string> = {
  draft: "bg-canvas text-mute ring-line",
  submitted: "bg-wait-soft text-wait ring-wait/20",
  approved: "bg-ok-soft text-ok ring-ok/20",
  rejected: "bg-no-soft text-no ring-no/20",
  withdrawn: "bg-canvas text-mute ring-line line-through decoration-mute/50",
};

const statusText: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyle[status]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {statusText[status] ?? status}
    </span>
  );
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const dims = size === "md" ? "size-9 text-sm" : "size-7 text-[11px]";
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ${dims}`}
      style={{ backgroundColor: `hsl(${hue} 32% 35%)` }}
    >
      {initials(name)}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 text-sm text-mute">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

const buttonBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const buttonStyles = {
  primary: `${buttonBase} bg-brand text-white hover:bg-brand/90`,
  secondary: `${buttonBase} border border-line bg-surface text-ink hover:bg-canvas`,
  danger: `${buttonBase} border border-no/30 bg-surface text-no hover:bg-no-soft`,
  ghost: `${buttonBase} text-ink-2 hover:bg-canvas`,
};

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: keyof typeof buttonStyles }) {
  return (
    <Link href={href} className={buttonStyles[variant]}>
      {children}
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-1 px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-mute">{children}</div> : null}
    </div>
  );
}
