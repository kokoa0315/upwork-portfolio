/**
 * Where to go after signing in: a path on this site, or `fallback`. Checking for a leading "/" isn't enough:
 * browsers read "/\evil.example" as "//evil.example", another site, and "/.//evil.example" normalizes to it.
 * So the path is resolved against a placeholder origin, kept only if it stays on that origin, and the normalized
 * result is checked again, because that result is what the browser receives.
 */
export function safeNext(next: string | undefined, fallback: string) {
  if (!next?.startsWith("/") || next.includes("\\")) return fallback;
  const origin = "http://this-site.invalid";
  try {
    const url = new URL(next, origin);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === origin && !path.startsWith("//") ? path : fallback;
  } catch {
    return fallback;
  }
}
