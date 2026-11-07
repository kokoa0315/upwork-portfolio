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
        {/* Phones: logo and sign-out on the first row, navigation on the second. Wider screens: one row. */}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-4 py-3 sm:flex sm:h-16 sm:px-6 sm:py-0">
          <Link href="/invoices" className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="truncate text-sm text-mute">{s.clientName}</span>
          </Link>
          <div className="col-span-2 row-start-2 -mx-1 sm:mx-0">
            <NavLinks />
          </div>
          <form action={signOut} className="flex items-center gap-3 sm:ml-auto">
            <Avatar name={s.name} />
            <span className="hidden text-sm sm:inline">
              {s.name} <span className="text-mute">· {roleLabel[s.role]}</span>
            </span>
            <span className="sr-only sm:hidden">
              Signed in as {s.name}, {roleLabel[s.role]}
            </span>
            <button className="min-h-9 rounded-lg px-2 py-1.5 text-sm text-mute hover:bg-canvas hover:text-ink">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
