import { afterEach, describe, expect, it } from "vitest";
import { anon, as, FERNWAY, LUMEN, LUMEN_INVOICE, membershipsOf, service, users } from "./helpers";

// Put Tom back the way the seed has him, whatever a test managed to do.
afterEach(async () => {
  await service().from("memberships").delete().eq("user_id", users.tom.id).neq("client_id", FERNWAY);
  await service().from("memberships").update({ role: "member", notify_on_invoice: true }).eq("user_id", users.tom.id);
});

describe("invoices are private to each client", () => {
  it("a client's users see only that client's invoices", async () => {
    const { data: fernway } = await (await as("tom")).from("invoices").select("number, client_id");
    expect(fernway!.length).toBe(5);
    expect(new Set(fernway!.map((i) => i.client_id))).toEqual(new Set([FERNWAY]));

    const { data: lumen } = await (await as("iris")).from("invoices").select("number, client_id");
    expect(lumen!.map((i) => i.number).sort()).toEqual(["CB-1043", "CB-1050", "CB-1053"]);
  });

  it("knowing another client's invoice id doesn't help", async () => {
    const { data } = await (await as("tom")).from("invoices").select("*").eq("id", LUMEN_INVOICE);
    expect(data).toEqual([]);
  });

  it("signed-out requests see nothing", async () => {
    const { data } = await anon().from("invoices").select("id");
    expect(data ?? []).toEqual([]);
  });
});

describe("team access", () => {
  it("a member can switch their own invoice emails off", async () => {
    const { error } = await (await as("tom")).from("memberships").update({ notify_on_invoice: false }).eq("user_id", users.tom.id);
    expect(error).toBeNull();
    expect(await membershipsOf("tom")).toEqual([{ client_id: FERNWAY, role: "member", notify_on_invoice: false }]);
  });

  it("a member can't make themselves an owner", async () => {
    await (await as("tom")).from("memberships").update({ role: "owner" }).eq("user_id", users.tom.id);
    expect((await membershipsOf("tom"))[0].role).toBe("member");
  });

  it("a member can't move their membership to another client", async () => {
    await (await as("tom")).from("memberships").update({ client_id: LUMEN }).eq("user_id", users.tom.id);
    expect((await membershipsOf("tom")).map((m) => m.client_id)).toEqual([FERNWAY]);
    const { data } = await (await as("tom")).from("invoices").select("id").eq("client_id", LUMEN);
    expect(data).toEqual([]);
  });

  it("an owner can change a teammate's role, but not their own", async () => {
    const maya = await as("maya");
    expect((await maya.rpc("set_member_role", { p_client: FERNWAY, p_user: users.tom.id, p_role: "owner" })).error).toBeNull();
    expect((await membershipsOf("tom"))[0].role).toBe("owner");
    expect((await maya.rpc("set_member_role", { p_client: FERNWAY, p_user: users.maya.id, p_role: "member" })).error).toMatchObject({ code: "42501" });
    expect((await membershipsOf("maya"))[0].role).toBe("owner");
  });

  it("two owners demoting each other at the same moment: one owner remains (20 races)", async () => {
    const [maya, tom] = [await as("maya"), await as("tom")];
    try {
      for (let round = 0; round < 20; round++) {
        expect((await maya.rpc("set_member_role", { p_client: FERNWAY, p_user: users.tom.id, p_role: "owner" })).error).toBeNull();
        const results = await Promise.all([
          maya.rpc("set_member_role", { p_client: FERNWAY, p_user: users.tom.id, p_role: "member" }),
          tom.rpc("set_member_role", { p_client: FERNWAY, p_user: users.maya.id, p_role: "member" }),
        ]);
        expect(results.filter((r) => !r.error), `round ${round}`).toHaveLength(1);
        const owners = await service().from("memberships").select("user_id").eq("client_id", FERNWAY).eq("role", "owner");
        expect(owners.data, `round ${round}`).toHaveLength(1);
        await service().from("memberships").update({ role: "owner" }).eq("user_id", users.maya.id);
        await service().from("memberships").update({ role: "member" }).eq("user_id", users.tom.id);
      }
    } finally {
      await service().from("memberships").update({ role: "owner" }).eq("user_id", users.maya.id);
    }
  });

  it("an owner of one client can't change roles at another, and a role belongs to one client", async () => {
    const iris = await as("iris");
    const { error } = await iris.rpc("set_member_role", { p_client: FERNWAY, p_user: users.tom.id, p_role: "owner" });
    expect(error).toMatchObject({ code: "42501" });
    expect((await membershipsOf("tom"))[0].role).toBe("member");
    // Tom also joins Lumen. Iris makes him an owner there; at Fernway he stays a member.
    expect((await service().from("memberships").insert({ client_id: LUMEN, user_id: users.tom.id, role: "member" })).error).toBeNull();
    expect((await iris.rpc("set_member_role", { p_client: LUMEN, p_user: users.tom.id, p_role: "owner" })).error).toBeNull();
    const roles = Object.fromEntries((await membershipsOf("tom")).map((m) => [m.client_id, m.role]));
    expect(roles).toEqual({ [FERNWAY]: "member", [LUMEN]: "owner" });
  });
});
