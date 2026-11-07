"use client";

import { useActionState, useState, useTransition } from "react";
import { RotateCcw, Send, X } from "lucide-react";
import { approveReply, dismissMessage, requeueMessage, type ActionState } from "../actions";
import { buttonStyles, Card } from "@/components/ui";

function ErrorText({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">
      {message}
    </p>
  ) : null;
}

export function ReviewPanel({ id, draft, provider }: { id: string; draft: string; provider: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveReply.bind(null, id), {});
  const [text, setText] = useState(state.body ?? draft);
  const [other, setOther] = useState<string>();
  const [busy, start] = useTransition();
  const edited = text.trim() !== draft.trim();
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          <label htmlFor="reply">Reply</label>
        </h2>
        <span className="text-xs text-mute">{edited ? "Edited by you" : `Draft from ${provider}`}</span>
      </div>
      <form action={action} className="mt-3 grid gap-3">
        <textarea
          id="reply"
          name="body"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={10_000}
          className="rounded-lg border border-line px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand"
        />
        <p className="text-xs text-mute">Demo outbox: approving records the reply but doesn&apos;t email anyone.</p>
        <ErrorText message={state.error ?? other} />
        <div className="flex flex-wrap gap-2">
          <button disabled={pending || busy} className={`${buttonStyles.primary} flex-1 whitespace-nowrap`}>
            <Send className="size-4" aria-hidden /> {pending ? "Approving…" : "Approve & send"}
          </button>
          <button
            type="button"
            disabled={pending || busy}
            onClick={() => start(async () => setOther((await requeueMessage(id)).error))}
            className={buttonStyles.secondary}
          >
            <RotateCcw className="size-4" aria-hidden /> New draft
          </button>
          <button
            type="button"
            disabled={pending || busy}
            onClick={() => start(async () => setOther((await dismissMessage(id)).error))}
            className={buttonStyles.ghost}
          >
            <X className="size-4" aria-hidden /> Dismiss
          </button>
        </div>
      </form>
    </Card>
  );
}

export function FailedPanel({ id, error }: { id: string; error: string | null }) {
  const [message, setMessage] = useState<string>();
  const [busy, start] = useTransition();
  return (
    <Card className="grid gap-3 p-5">
      <h2 className="text-sm font-semibold">This message couldn&apos;t be triaged</h2>
      {error ? <p className="rounded-lg bg-canvas px-3 py-2 font-mono text-xs break-words text-ink-2">{error}</p> : null}
      <p className="text-sm text-mute">Try again, or handle it yourself and dismiss it here.</p>
      <ErrorText message={message} />
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => start(async () => setMessage((await requeueMessage(id)).error))} className={buttonStyles.primary}>
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <button disabled={busy} onClick={() => start(async () => setMessage((await dismissMessage(id)).error))} className={buttonStyles.ghost}>
          Dismiss
        </button>
      </div>
    </Card>
  );
}
