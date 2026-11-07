import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SYSTEM_PROMPT, userContent } from "./prompt";
import { TriageError, TriageOutput, type TriageProvider } from "./schema";

export const CLAUDE_MODEL = "claude-opus-5-5";

export function claudeProvider(client = new Anthropic({ maxRetries: 2, timeout: 60_000 })): TriageProvider {
  return {
    name: "claude",
    async triage(email, signal) {
      const started = Date.now();
      let response;
      try {
        response = await client.beta.messages.parse(
          {
            model: CLAUDE_MODEL,
            max_tokens: 4000,
            // Classification and a short draft: low effort is enough and keeps cost and latency down.
            output_config: { effort: "low", format: betaZodOutputFormat(TriageOutput) },
            // If a safety classifier declines, the API retries on a fallback model it picks for that category.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userContent(email) }],
          },
          { signal },
        );
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
          throw new TriageError(`Claude API unavailable: ${err.message}`, true);
        }
        if (err instanceof Anthropic.APIError) throw new TriageError(`Claude API error ${err.status}: ${err.message}`, false);
        throw err;
      }

      if (response.stop_reason === "refusal") {
        throw new TriageError(`The model declined this email (${response.stop_details?.category ?? "no category"}).`, false);
      }
      if (response.stop_reason === "max_tokens") throw new TriageError("The model ran out of output tokens.", true);
      const parsed = TriageOutput.safeParse(response.parsed_output);
      if (!parsed.success) throw new TriageError("The model's answer didn't match the expected shape.", true);

      return {
        ...parsed.data,
        provider: "claude",
        model: response.model,
        input_tokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        output_tokens: response.usage.output_tokens,
        latency_ms: Date.now() - started,
      };
    },
  };
}
