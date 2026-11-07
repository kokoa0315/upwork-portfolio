"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { decideRequest, deleteDraft, submitRequest, withdrawRequest, type FormState } from "../actions";
import { buttonStyles, Card } from "@/components/ui";

function ErrorText({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">
      {message}
    </p>
  ) : null;
}

export function RequesterActions({ id, status }: { id: string; status: "draft" | "submitted" }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: (id: string) => Promise<FormState>) =>
    start(async () => {
      const res = await fn(id);
      setError(res.error);
    });
  return (
    <Card className="grid gap-3 p-5">
      <h2 className="text-sm font-semibold">{status === "draft" ? "This is still a draft" : "Waiting for an approver"}</h2>
      <p className="text-sm text-mute">
        {status === "draft" ? "Approvers can't see it until you submit it." : "You can withdraw it if plans change. It can't be edited once submitted."}
      </p>
      <ErrorText message={error} />
      {status === "draft" ? (
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => run(submitRequest)} className={buttonStyles.primary}>
            Submit for approval
          </button>
          <button disabled={pending} onClick={() => run(deleteDraft)} className={buttonStyles.ghost}>
            Delete draft
          </button>
        </div>
      ) : (
        <button disabled={pending} onClick={() => run(withdrawRequest)} className={buttonStyles.secondary}>
          Withdraw request
        </button>
      )}
    </Card>
  );
}

export function DecisionPanel({ id, overLimit, limit }: { id: string; overLimit: boolean; limit: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decideRequest.bind(null, id), {});
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Your decision</h2>
      {overLimit ? (
        <p className="mt-2 rounded-lg bg-wait-soft px-3 py-2 text-sm text-wait">
          This is above your {limit} approval limit. You can reject it, or leave it for an admin or owner.
        </p>
      ) : null}
      <form action={action} className="mt-3 grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Note to the requester</span>
          <textarea
            name="note"
            defaultValue={state.values?.note}
            rows={3}
            maxLength={500}
            aria-invalid={!!state.fieldErrors?.note}
            placeholder="Required when rejecting"
            className="rounded-lg border border-line px-3 py-2 outline-none focus:border-brand aria-[invalid=true]:border-no"
          />
          {state.fieldErrors?.note ? <span className="text-no">{state.fieldErrors.note}</span> : null}
        </label>
        <ErrorText message={state.error} />
        <div className="grid grid-cols-2 gap-2">
          <button name="decision" value="rejected" disabled={pending} className={buttonStyles.danger}>
            <X className="size-4" aria-hidden /> Reject
          </button>
          <button name="decision" value="approved" disabled={pending || overLimit} className={buttonStyles.primary}>
            <Check className="size-4" aria-hidden /> Approve
          </button>
        </div>
      </form>
    </Card>
  );
}
