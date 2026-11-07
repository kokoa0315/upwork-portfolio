import { claudeProvider } from "./claude";
import { rulesProvider } from "./rules";
import type { TriageProvider } from "./schema";

/** TRIAGE_PROVIDER=claude uses the Claude API (needs ANTHROPIC_API_KEY). Anything else uses the offline rules. */
export function getProvider(): TriageProvider {
  return process.env.TRIAGE_PROVIDER === "claude" ? claudeProvider() : rulesProvider;
}
