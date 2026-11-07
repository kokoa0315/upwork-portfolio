"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { buttonStyles } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className="mt-8 grid gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="grid gap-1.5 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="h-10 rounded-lg border border-line bg-surface px-3 font-normal outline-none focus:border-brand"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 rounded-lg border border-line bg-surface px-3 font-normal outline-none focus:border-brand"
        />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} h-10`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
