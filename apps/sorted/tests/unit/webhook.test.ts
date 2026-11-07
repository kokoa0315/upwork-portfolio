import { describe, expect, it } from "vitest";
import { InboundEmail, sign, TOLERANCE_SECONDS, verify } from "../../lib/webhook";

const secret = "test-secret";
const team = "20000000-0000-4000-8000-000000000001";
const otherTeam = "20000000-0000-4000-8000-000000000009";
const now = 1_800_000_000;
const body = JSON.stringify({ id: "m-1", from: { email: "a@example.com" }, subject: "Hi", text: "Hello" });

describe("webhook signature", () => {
  it("accepts a correctly signed, fresh delivery", () => {
    expect(verify(secret, team, body, String(now), sign(secret, now, team, body), now)).toEqual({ ok: true });
  });

  it("rejects a missing header", () => {
    expect(verify(secret, team, body, null, sign(secret, now, team, body), now)).toEqual({ ok: false, reason: "missing headers" });
    expect(verify(secret, team, body, String(now), null, now)).toEqual({ ok: false, reason: "missing headers" });
  });

  it("rejects a changed body", () => {
    const sig = sign(secret, now, team, body);
    expect(verify(secret, team, body.replace("Hello", "Hello!"), String(now), sig, now)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects the wrong secret", () => {
    expect(verify(secret, team, body, String(now), sign("other", now, team, body), now)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects a replay outside the tolerance window, and a replay with a swapped timestamp", () => {
    const old = now - TOLERANCE_SECONDS - 1;
    expect(verify(secret, team, body, String(old), sign(secret, old, team, body), now)).toEqual({ ok: false, reason: "stale timestamp" });
    // The timestamp is signed, so moving it forward breaks the signature.
    expect(verify(secret, team, body, String(now), sign(secret, old, team, body), now)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects a delivery signed for one team and posted to another", () => {
    expect(verify(secret, otherTeam, body, String(now), sign(secret, now, team, body), now)).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verify(secret, team, body, String(now), "sha256=abc", now)).toEqual({ ok: false, reason: "bad signature" });
    expect(verify(secret, team, body, "not-a-number", sign(secret, now, team, body), now)).toEqual({ ok: false, reason: "stale timestamp" });
  });
});

describe("payload", () => {
  it("requires an id, a valid sender and a body", () => {
    expect(InboundEmail.safeParse({ id: "x", from: { email: "nope" }, text: "hi" }).success).toBe(false);
    expect(InboundEmail.safeParse({ id: "x", from: { email: "a@example.com" }, text: "" }).success).toBe(false);
    expect(InboundEmail.safeParse({ id: "x", from: { email: "a@example.com" }, text: "hi" }).data?.subject).toBe("");
  });
});
