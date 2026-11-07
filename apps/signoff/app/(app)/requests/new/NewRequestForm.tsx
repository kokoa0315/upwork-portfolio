"use client";

import { useActionState } from "react";
import { createRequest, type FormState } from "../actions";
import { buttonStyles, Card } from "@/components/ui";

const field = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand aria-[invalid=true]:border-no";

export function NewRequestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createRequest, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <Card className="p-5 sm:p-6">
      <form action={action} className="grid gap-5" noValidate>
        <Field label="What do you need?" error={err.title} htmlFor="title">
          <input id="title" name="title" defaultValue={v.title} maxLength={120} placeholder="e.g. Figma seats for the design team" aria-invalid={!!err.title} className={field} />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Category" error={err.category} htmlFor="category">
            <select id="category" name="category" defaultValue={v.category ?? ""} aria-invalid={!!err.category} className={field}>
              <option value="" disabled>
                Choose…
              </option>
              <option value="software">Software</option>
              <option value="hardware">Hardware</option>
              <option value="travel">Travel</option>
              <option value="services">Services</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Amount (USD)" error={err.amount} htmlFor="amount">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-mute">$</span>
              <input id="amount" name="amount" defaultValue={v.amount} inputMode="decimal" placeholder="0.00" aria-invalid={!!err.amount} className={`${field} pl-7 tabular-nums`} />
            </div>
          </Field>
        </div>
        <Field label="Why is it needed?" hint="Optional. A sentence or two helps approvers decide quickly." error={err.description} htmlFor="description">
          <textarea id="description" name="description" defaultValue={v.description} rows={4} maxLength={2000} className={`${field} h-auto py-2`} />
        </Field>
        {state.error ? (
          <p role="alert" className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          <button name="intent" value="draft" disabled={pending} className={buttonStyles.secondary}>
            Save as draft
          </button>
          <button name="intent" value="submit" disabled={pending} className={buttonStyles.primary}>
            {pending ? "Saving…" : "Submit for approval"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-no">{error}</p>
      ) : hint ? (
        <p className="text-sm text-mute">{hint}</p>
      ) : null}
    </div>
  );
}
