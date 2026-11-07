import type { TriageOutput, TriageProvider } from "./schema";

// A deterministic, offline stand-in for the model. Tests and the no-API-key demo use it, and the UI labels
// its output "Rules (no AI)" so nobody mistakes it for a model's answer.

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function rulesTriage(subject: string, body: string): TriageOutput {
  const text = `${subject}\n${body}`.toLowerCase();
  const category: TriageOutput["category"] = has(text, ["charge", "invoice", "refund", "billing", "plan", "receipt"])
    ? "billing"
    : has(text, ["crash", "error", "broken", "bug", "stopped", "doesn't work", "not working"])
      ? "bug"
      : has(text, ["log in", "login", "sign in", "password", "2fa", "delete my account", "account"])
        ? "account"
        : has(text, ["how do i", "how can i", "how to", "is there a way"])
          ? "how_to"
          : has(text, ["feature", "would be great", "please add", "could you add", "wish"])
            ? "feature_request"
            : "other";
  const priority: TriageOutput["priority"] = has(text, ["data loss", "lost all", "outage", "urgent", "security"])
    ? "urgent"
    : has(text, ["charged twice", "can't log in", "cannot log in", "crash", "locked out"])
      ? "high"
      : category === "feature_request" || category === "other"
        ? "low"
        : "normal";
  const needsHuman = has(text, ["refund", "delete my account", "lawyer", "legal", "gdpr", "ignore previous", "ignore all previous"]);
  const firstSentence = body.trim().split(/(?<=[.!?])\s/)[0]?.slice(0, 160) ?? subject;
  return {
    category,
    priority,
    summary: firstSentence,
    draft_reply: `Hi,\n\nThanks for writing in about "${subject}". A teammate is looking into this and will follow up shortly.\n\nThe Tidebook team`,
    confidence: 0.5,
    needs_human_reason: needsHuman ? "Matched a keyword that always needs a person (refund, deletion, legal, or instructions in the email)." : null,
  };
}

export const rulesProvider: TriageProvider = {
  name: "rules",
  async triage(email) {
    const started = Date.now();
    return { ...rulesTriage(email.subject, email.body), provider: "rules", model: "rules-v1", input_tokens: 0, output_tokens: 0, latency_ms: Date.now() - started };
  },
};
