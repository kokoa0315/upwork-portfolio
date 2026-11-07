import { describe, expect, it } from "vitest";
import { anon, as, CONTOSO, NORTHWIND, service, submitted, users } from "./helpers";

describe("who can see what", () => {
  it("anonymous visitors can't read requests or call the RPCs", async () => {
    // A hosted Supabase project grants every table to anon, so row-level security is what has to hide the rows.
    for (const table of ["organizations", "profiles", "memberships", "requests", "request_events", "role_events"]) {
      const read = await anon().from(table).select("*");
      expect(read.data ?? [], table).toEqual([]);
    }
    expect((await anon().from("requests").insert({ org_id: NORTHWIND, title: "x", amount_cents: 1 })).error, "insert").not.toBeNull();
    const rpc = await anon().rpc("dashboard_stats", { p_org: NORTHWIND });
    expect(rpc.error?.code).toBe("42501");
    // State-changing functions too: refused by the grant itself, not only by a null auth.uid() inside.
    const decide = await anon().rpc("decide_request", { p_id: "00000000-0000-4000-8000-0000000000ff", p_decision: "approved", p_note: null });
    expect(decide.error?.code).toBe("42501");
    const role = await anon().rpc("set_member_role", { p_org: NORTHWIND, p_user: users.priya.id, p_role: "owner" });
    expect(role.error?.code).toBe("42501");
  });

  it("a member sees only their own requests", async () => {
    const { data, error } = await (await as("priya")).from("requests").select("requester_id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((r) => r.requester_id))).toEqual(new Set([users.priya.id]));
  });

  it("reviewers see the whole organization and nothing outside it", async () => {
    const all = await service().from("requests").select("id").eq("org_id", NORTHWIND);
    const { data } = await (await as("marcus")).from("requests").select("org_id");
    expect(data!.length).toBe(all.data!.length);
    expect(data!.every((r) => r.org_id === NORTHWIND)).toBe(true);
  });

  it("another tenant's owner sees none of Northwind's data", async () => {
    const db = await as("sam");
    const requests = await db.from("requests").select("org_id");
    expect(requests.data!.length).toBeGreaterThan(0);
    expect(requests.data!.every((r) => r.org_id === CONTOSO)).toBe(true);
    const events = await db.from("request_events").select("org_id");
    expect(events.data!.every((r) => r.org_id === CONTOSO)).toBe(true);
    const people = await db.from("profiles").select("id");
    expect(people.data!.map((p) => p.id)).toEqual([users.sam.id]);
    const byId = await db.from("requests").select("id").eq("org_id", NORTHWIND);
    expect(byId.data).toEqual([]);
  });

  it("a user can't file a request into an organization they don't belong to", async () => {
    const { error } = await (await as("sam"))
      .from("requests")
      .insert({ org_id: NORTHWIND, requester_id: users.sam.id, title: "Sneaky", category: "other", amount_cents: 100 });
    expect(error?.code).toBe("42501");
  });

  it("a user can't file a request on someone else's behalf", async () => {
    const { error } = await (await as("priya"))
      .from("requests")
      .insert({ org_id: NORTHWIND, requester_id: users.diego.id, title: "For Diego", category: "other", amount_cents: 100 });
    expect(error?.code).toBe("42501");
  });

  it("a member can't promote themselves by writing to memberships", async () => {
    const db = await as("priya");
    const { error } = await db.from("memberships").update({ role: "owner" }).eq("user_id", users.priya.id);
    expect(error?.code).toBe("42501");
    const role = await service().from("memberships").select("role").eq("user_id", users.priya.id).single();
    expect(role.data!.role).toBe("member");
  });

  it("the audit log is append-only for users", async () => {
    const db = await as("olivia");
    const requestId = await submitted("priya");
    const ins = await db.from("request_events").insert({ org_id: NORTHWIND, request_id: requestId, actor_id: users.olivia.id, action: "approved" });
    expect(ins.error?.code).toBe("42501");
    const del = await db.from("request_events").delete().eq("org_id", NORTHWIND);
    expect(del.error?.code).toBe("42501");
  });

  it("deleting a draft keeps its entries in the audit log, and adds one", async () => {
    const priya = await as("priya");
    const draft = await priya.from("requests").insert({ org_id: NORTHWIND, requester_id: users.priya.id, title: "Draft to delete", category: "software", amount_cents: 900 }).select("id").single();
    expect(draft.error).toBeNull();
    const removed = await priya.from("requests").delete({ count: "exact" }).eq("id", draft.data!.id);
    expect(removed.count).toBe(1);
    // Both entries stay, and request_ref still ties them to the draft that is gone.
    const created = await service().from("request_events").select("action, request_id, request_ref, note").eq("org_id", NORTHWIND).eq("actor_id", users.priya.id).order("id", { ascending: false }).limit(2);
    expect(created.data).toEqual([
      { action: "deleted", request_id: null, request_ref: draft.data!.id, note: "Draft to delete" },
      { action: "created", request_id: null, request_ref: draft.data!.id, note: null },
    ]);
    // The author and the reviewers still read them; another member doesn't.
    const seen = async (who: "priya" | "olivia" | "diego") =>
      ((await (await as(who)).from("request_events").select("note").eq("action", "deleted").eq("note", "Draft to delete")).data ?? []).length;
    expect(await seen("priya")).toBeGreaterThan(0);
    expect(await seen("olivia")).toBeGreaterThan(0);
    expect(await seen("diego")).toBe(0);
  });
});
