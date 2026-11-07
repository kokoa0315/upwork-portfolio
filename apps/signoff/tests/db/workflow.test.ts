import { describe, expect, it } from "vitest";
import { as, NORTHWIND, service, submitted, users, type User } from "./helpers";

const decide = async (who: User, id: string, decision: "approved" | "rejected", note: string | null = null) =>
  (await as(who)).rpc("decide_request", { p_id: id, p_decision: decision, p_note: note });

describe("approval rules", () => {
  it("an approver can approve a submitted request, and it is logged", async () => {
    const id = await submitted("priya");
    const { data, error } = await decide("marcus", id, "approved");
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "approved", decided_by: users.marcus.id });
    const log = await service().from("request_events").select("action, actor_id").eq("request_id", id).order("created_at");
    expect(log.data!.map((e) => e.action)).toEqual(["created", "submitted", "approved"]);
    expect(log.data!.at(-1)!.actor_id).toBe(users.marcus.id);
  });

  it("members can't decide", async () => {
    const id = await submitted("priya");
    const { error } = await decide("diego", id, "approved");
    expect(error).toMatchObject({ code: "42501", message: "only reviewers can decide requests" });
  });

  it("nobody approves their own request, not even the owner", async () => {
    const id = await submitted("olivia");
    const { error } = await decide("olivia", id, "approved");
    expect(error).toMatchObject({ code: "42501", message: "you cannot decide your own request" });
  });

  it("approvers are capped at the organization's limit; admins aren't", async () => {
    const id = await submitted("priya", 750_000); // $7,500 against a $5,000 limit
    expect((await decide("marcus", id, "approved")).error).toMatchObject({ message: "amount is above your approval limit" });
    expect((await decide("hana", id, "approved")).error).toBeNull();
  });

  it("an approver may still reject an amount above their limit", async () => {
    const id = await submitted("priya", 750_000);
    expect((await decide("marcus", id, "rejected", "Please split this by quarter.")).error).toBeNull();
  });

  it("a rejection needs a note", async () => {
    const id = await submitted("priya");
    expect((await decide("marcus", id, "rejected", "   ")).error).toMatchObject({ code: "22023" });
  });

  it("a decided request can't be decided again", async () => {
    const id = await submitted("priya");
    await decide("marcus", id, "approved");
    expect((await decide("hana", id, "rejected", "Changed my mind")).error).toMatchObject({ code: "55000", message: "request already approved" });
  });

  it("two reviewers deciding at the same moment: exactly one wins", async () => {
    for (let round = 0; round < 5; round++) {
      const id = await submitted("diego", 10_000, `Race ${round}`);
      const results = await Promise.all([decide("marcus", id, "approved"), decide("hana", id, "rejected", "Not this quarter")]);
      expect(results.filter((r) => !r.error)).toHaveLength(1);
      expect(results.find((r) => r.error)!.error!.code).toBe("55000");
      const log = await service().from("request_events").select("action").eq("request_id", id).in("action", ["approved", "rejected"]);
      expect(log.data).toHaveLength(1);
    }
  });
});

describe("request lifecycle", () => {
  it("a submitted request can't be edited, even by its author", async () => {
    const id = await submitted("priya", 20_000);
    const { error } = await (await as("priya")).from("requests").update({ amount_cents: 1 }).eq("id", id);
    // RLS lets authors update only drafts, so the row isn't matched at all.
    expect(error).toBeNull();
    const row = await service().from("requests").select("amount_cents").eq("id", id).single();
    expect(row.data!.amount_cents).toBe(20_000);
  });

  it("a requester can't approve, or write dates and decisions, by writing columns directly", async () => {
    const db = await as("priya");
    const base = { org_id: NORTHWIND, requester_id: users.priya.id, title: "Direct write", category: "other", amount_cents: 500 };
    const draft = await db.from("requests").insert(base).select("id").single();
    expect(draft.error).toBeNull();
    const forged = {
      status: "approved",
      submitted_at: "2020-01-01T00:00:00Z",
      decided_at: "2020-01-02T00:00:00Z",
      decision_note: "Approved by the CFO",
      created_at: "2020-01-01T00:00:00Z",
    };
    for (const [column, value] of Object.entries(forged)) {
      const update = await db.from("requests").update({ [column]: value }).eq("id", draft.data!.id);
      expect(update.error, `update ${column}`).toMatchObject({ code: "42501" });
      const insert = await db.from("requests").insert({ ...base, [column]: value });
      expect(insert.error, `insert ${column}`).toMatchObject({ code: "42501" });
    }
    // What a draft is made of stays editable.
    expect((await db.from("requests").update({ title: "Direct write, edited" }).eq("id", draft.data!.id)).error).toBeNull();
    const row = await service().from("requests").select("title, status, submitted_at, decided_at, decision_note").eq("id", draft.data!.id).single();
    expect(row.data).toEqual({ title: "Direct write, edited", status: "draft", submitted_at: null, decided_at: null, decision_note: null });
  });

  it("the status rules hold even for code that bypasses RLS and the column grants", async () => {
    // The service role skips both; the trigger is what stops a buggy server job from reopening or editing a decision.
    const id = await submitted("priya", 1_000);
    expect((await decide("marcus", id, "approved")).error).toBeNull();
    expect((await service().from("requests").update({ status: "draft" }).eq("id", id)).error).toMatchObject({ code: "23514" });
    expect((await service().from("requests").update({ amount_cents: 1 }).eq("id", id)).error).toMatchObject({ code: "23514" });
  });

  it("withdrawn is final", async () => {
    const id = await submitted("priya");
    expect((await (await as("priya")).rpc("withdraw_request", { p_id: id })).error).toBeNull();
    expect((await decide("marcus", id, "approved")).error).toMatchObject({ code: "55000" });
  });

  it("only the author can withdraw", async () => {
    const id = await submitted("priya");
    expect((await (await as("diego")).rpc("withdraw_request", { p_id: id })).error).toMatchObject({ code: "P0002" });
  });
});

describe("roles", () => {
  const setRole = async (who: User, user: string, role: string) => (await as(who)).rpc("set_member_role", { p_org: NORTHWIND, p_user: user, p_role: role });

  it("members and approvers can't change roles", async () => {
    expect((await setRole("priya", users.priya.id, "admin")).error).toMatchObject({ code: "42501" });
    expect((await setRole("marcus", users.priya.id, "approver")).error).toMatchObject({ code: "42501" });
  });

  it("admins can't touch owners or make new ones", async () => {
    expect((await setRole("hana", users.olivia.id, "member")).error).toMatchObject({ code: "42501" });
    expect((await setRole("hana", users.diego.id, "owner")).error).toMatchObject({ code: "42501" });
  });

  it("an organization always keeps at least one owner", async () => {
    expect((await setRole("olivia", users.olivia.id, "admin")).error).toMatchObject({ code: "55000" });
  });

  it("two owners demoting each other at the same moment: one owner remains (20 races)", async () => {
    const owners = async () =>
      (await service().from("memberships").select("user_id").eq("org_id", NORTHWIND).eq("role", "owner")).data!.length;
    try {
      for (let i = 0; i < 20; i++) {
        expect((await setRole("olivia", users.hana.id, "owner")).error).toBeNull();
        const results = await Promise.all([setRole("olivia", users.hana.id, "admin"), setRole("hana", users.olivia.id, "admin")]);
        expect(results.filter((r) => r.error === null)).toHaveLength(1);
        expect(await owners()).toBe(1);
        // Whoever is still owner hands it back, so each round starts from Olivia owner + Hana admin.
        const { data } = await service().from("memberships").select("user_id").eq("org_id", NORTHWIND).eq("role", "owner").single();
        if (data!.user_id === users.hana.id) {
          expect((await setRole("hana", users.olivia.id, "owner")).error).toBeNull();
          expect((await setRole("olivia", users.hana.id, "admin")).error).toBeNull();
        }
      }
    } finally {
      await service().from("memberships").update({ role: "owner" }).eq("org_id", NORTHWIND).eq("user_id", users.olivia.id);
      await service().from("memberships").update({ role: "admin" }).eq("org_id", NORTHWIND).eq("user_id", users.hana.id);
    }
  });

  it("every role change is logged, and only owners and admins read the log", async () => {
    const before = (await service().from("role_events").select("id", { count: "exact", head: true }).eq("org_id", NORTHWIND)).count!;
    expect((await setRole("hana", users.diego.id, "approver")).error).toBeNull();
    expect((await setRole("hana", users.diego.id, "member")).error).toBeNull();
    // Setting the role someone already has changes nothing and logs nothing.
    expect((await setRole("hana", users.diego.id, "member")).error).toBeNull();
    const latest = await service().from("role_events").select("actor_id, user_id, old_role, new_role").eq("org_id", NORTHWIND).order("id", { ascending: false }).limit(2);
    expect(latest.data).toEqual([
      { actor_id: users.hana.id, user_id: users.diego.id, old_role: "approver", new_role: "member" },
      { actor_id: users.hana.id, user_id: users.diego.id, old_role: "member", new_role: "approver" },
    ]);
    expect((await service().from("role_events").select("id", { count: "exact", head: true }).eq("org_id", NORTHWIND)).count).toBe(before + 2);

    const read = async (who: User) => ((await (await as(who)).from("role_events").select("id")).data ?? []).length;
    expect(await read("olivia")).toBeGreaterThanOrEqual(2);
    expect(await read("hana")).toBeGreaterThanOrEqual(2);
    expect(await read("marcus")).toBe(0);
    expect(await read("diego")).toBe(0);
    expect(await read("sam")).toBe(0);
    // Nobody writes or erases it directly.
    const hana = await as("hana");
    expect((await hana.from("role_events").insert({ org_id: NORTHWIND, actor_id: users.hana.id, user_id: users.diego.id, old_role: "member", new_role: "owner" })).error).toMatchObject({ code: "42501" });
    expect((await hana.from("role_events").delete().eq("org_id", NORTHWIND)).error).toMatchObject({ code: "42501" });
  });

  it("a promotion takes effect immediately, and so does the demotion", async () => {
    expect((await setRole("hana", users.diego.id, "approver")).error).toBeNull();
    const promoted = await (await as("diego")).from("requests").select("requester_id");
    expect(new Set(promoted.data!.map((r) => r.requester_id)).size).toBeGreaterThan(1);
    expect((await setRole("hana", users.diego.id, "member")).error).toBeNull();
    const demoted = await (await as("diego")).from("requests").select("requester_id");
    expect(new Set(demoted.data!.map((r) => r.requester_id))).toEqual(new Set([users.diego.id]));
  });
});
