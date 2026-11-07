import Link from "next/link";
import { getSession } from "@/lib/session";
import { roleLabel } from "@/lib/format";
import { Avatar } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6 whitespace-nowrap">
          <Link href="/invoices" className="flex items-center gap-3">
            <Logo />
            <span className="text-sm text-mute">{s.clientName}</span>
          </Link>
          <NavLinks />
          <form action={signOut} className="ml-auto flex items-center gap-3">
            <Avatar name={s.name} />
            <span className="text-sm">
              {s.name} <span className="text-mute">· {roleLabel[s.role]}</span>
            </span>
            <button className="rounded-lg px-2 py-1.5 text-sm text-mute hover:bg-canvas hover:text-ink">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
