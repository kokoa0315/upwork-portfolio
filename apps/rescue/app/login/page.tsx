import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Logo size="md" />
        <h1 className="mt-10 text-2xl font-semibold tracking-tight">Client portal</h1>
        <p className="mt-2 text-sm text-mute">Invoices and team access for Cobalt Studio clients.</p>
        <LoginForm next={next} />
        <div className="mt-10 rounded-lg border border-dashed border-line p-4 text-sm">
          <p className="font-medium">Demo accounts</p>
          <p className="mt-1 text-mute">
            Fictional data for a rescue case study. Password for all: <code className="font-mono text-ink">demo-password-123</code>
          </p>
          <ul className="mt-3 grid gap-1.5">
            {[
              ["Maya Lin", "Fernway, owner", "maya@fernway.test"],
              ["Tom Reyes", "Fernway, member", "tom@fernway.test"],
              ["Iris Novak", "Lumen, owner", "iris@lumen.test"],
            ].map(([name, role, email]) => (
              <li key={email} className="flex justify-between gap-3">
                <span>
                  {name} <span className="text-mute">· {role}</span>
                </span>
                <code className="truncate font-mono text-xs text-mute">{email}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
