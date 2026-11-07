import { getSession, canManage } from "@/lib/session";
import { roleLabel } from "@/lib/format";
import { Avatar } from "@/components/ui";
import { NavLinks } from "@/components/NavLinks";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const links = [
    { href: "/dashboard", label: "Overview", icon: "home" as const },
    { href: "/requests", label: "Requests", icon: "list" as const },
    { href: "/activity", label: "Activity", icon: "clock" as const },
    ...(canManage(s.role) ? [{ href: "/members", label: "Members", icon: "users" as const }] : []),
  ];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              <span className="grid size-6 place-items-center rounded-md bg-brand text-white">
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                  <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Signoff
            </p>
            <p className="mt-0.5 truncate text-xs text-mute">{s.orgName}</p>
          </div>
          <form action={signOut} className="flex items-center gap-2 lg:hidden">
            <span className="sr-only">
              Signed in as {s.name}, {roleLabel[s.role]}
            </span>
            <Avatar name={s.name} />
            <button className="rounded-lg px-2 py-1.5 text-sm text-mute hover:bg-canvas hover:text-ink">Sign out</button>
          </form>
        </div>
        <NavLinks links={links} />
        <div className="hidden border-t border-line p-4 lg:mt-auto lg:block">
          <div className="flex items-center gap-3">
            <Avatar name={s.name} size="md" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{s.name}</p>
              <p className="truncate text-xs text-mute">{roleLabel[s.role]}</p>
            </div>
          </div>
          <form action={signOut} className="mt-3">
            <button className="inline-flex min-h-6 items-center text-sm text-mute hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
