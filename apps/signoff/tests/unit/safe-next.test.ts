import { describe, expect, it } from "vitest";
import { safeNext } from "../../lib/safe-next";

const site = "https://app.example";
/** Where a browser on this site would go after a redirect to `path`. Node's URL follows the same spec as browsers. */
const lands = (path: string) => new URL(path, `${site}/login`).origin;

describe("safeNext", () => {
  it.each([
    [undefined],
    [""],
    ["dashboard"],
    ["https://evil.invalid/x"],
    ["//evil.invalid/x"],
    ["/\\evil.invalid/x"],
    ["/\t/evil.invalid/x"],
    ["/\n/evil.invalid/x"],
    // Dot segments that normalize to "//evil.invalid" (found by the sixth review).
    ["/.//evil.invalid/x"],
    ["/%2e//evil.invalid/x"],
    ["/%2E%2e//evil.invalid/x"],
    ["/a/..//evil.invalid/x"],
    ["/..//evil.invalid/x"],
  ])("refuses %j", (next) => {
    expect(safeNext(next, "/home")).toBe("/home");
  });

  it.each([
    ["/requests/abc?tab=1#note", "/requests/abc?tab=1#note"],
    ["/%2F/evil.invalid", "/%2F/evil.invalid"],
    ["/%5Cevil.invalid", "/%5Cevil.invalid"],
    ["/a/../requests", "/requests"],
  ])("keeps %j on this site", (next, expected) => {
    expect(safeNext(next, "/home")).toBe(expected);
    expect(lands(expected)).toBe(site);
  });

  it("never returns a path that leaves the site, for any mix of tricky segments", () => {
    const parts = ["", ".", "..", "%2e", "%2E%2e", "a", "\t", "\\", "%5C", "%2F", "evil.invalid"];
    let tried = 0;
    for (const a of parts)
      for (const b of parts)
        for (const c of parts)
          for (const d of parts) {
            const next = `/${a}/${b}/${c}/${d}`;
            expect(lands(safeNext(next, "/home")), next).toBe(site);
            tried++;
          }
    expect(tried).toBe(parts.length ** 4);
  });
});
