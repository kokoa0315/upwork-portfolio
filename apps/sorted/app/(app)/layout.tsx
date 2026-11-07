import { getSession } from "@/lib/session";
import { Avatar } from "@/components/ui";
import { NavLinks } from "@/components/NavLinks";
import { Logo } from "@/components/Logo";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const links = [
    { href: "/dashboard", label: "Overview", icon: "home" as const },
    { href: "/inbox", label: "Inbox", icon: "list" as const },
    { href: "/outbox", label: "Outbox", icon: "clock" as const },
  ];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
          <div className="min-w-0">
            <Logo />
            <p className="mt-0.5 truncate text-xs text-mute">{s.teamName}</p>
          </div>
          <form action={signOut} className="flex items-center gap-2 lg:hidden">
            <span className="sr-only">Signed in as {s.name}</span>
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
              <p className="truncate text-xs text-mute">{s.email}</p>
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
