import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">Sign in to Signoff</h1>
          <p className="mt-2 text-sm text-mute">Purchase and expense approvals for your team.</p>
          <LoginForm next={next} />
          <DemoAccounts />
        </div>
      </div>
      <aside className="hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-16">
        <p className="text-sm font-medium text-brand">How a request moves</p>
        <ol className="mt-6 grid max-w-md gap-5">
          {[
            ["Draft", "A teammate writes up what they need and why."],
            ["Awaiting review", "Approvers see it in their queue. Nobody can approve their own request."],
            ["Approved or rejected", "Approvers sign off up to their limit. A rejection always comes with a reason."],
          ].map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[2rem_1fr] gap-3">
              <span className="grid size-8 place-items-center rounded-full border border-line font-mono text-xs text-mute">{i + 1}</span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-mute">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <span className="grid size-7 place-items-center rounded-md bg-brand text-white">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      Signoff
    </div>
  );
}

function DemoAccounts() {
  const people = [
    ["Olivia Park", "Owner", "olivia@northwind.test"],
    ["Marcus Chen", "Approver", "marcus@northwind.test"],
    ["Priya Shah", "Member", "priya@northwind.test"],
  ];
  return (
    <div className="mt-10 rounded-lg border border-dashed border-line p-4 text-sm">
      <p className="font-medium">Demo accounts</p>
      <p className="mt-1 text-mute">
        Password for all: <code className="font-mono text-ink">demo-password-123</code>
      </p>
      <ul className="mt-3 grid gap-1.5">
        {people.map(([name, role, email]) => (
          <li key={email} className="flex justify-between gap-3">
            <span>
              {name} <span className="text-mute">· {role}</span>
            </span>
            <code className="truncate font-mono text-xs text-mute">{email}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
