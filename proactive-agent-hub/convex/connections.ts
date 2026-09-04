import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")) },
  returns: v.array(v.object({ _id: v.id("integrations"), _creationTime: v.number(), workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))), key: v.string(), name: v.string(), status: v.union(v.literal("connected"), v.literal("demo"), v.literal("disconnected")), syncMode: v.union(v.literal("webhook"), v.literal("polling")), lastSyncAt: v.number(), permissions: v.array(v.string()), capabilities: v.array(v.string()), description: v.string(), sortOrder: v.number(), cursor: v.optional(v.string()), accountEmail: v.optional(v.union(v.string(), v.null())), connectionKind: v.optional(v.union(v.literal("demo"), v.literal("oauth"))) })),
  handler: async (ctx, args) => await ctx.db.query("integrations").withIndex("by_workspace_and_sortOrder", (q) => q.eq("workspace", args.workspace)).order("asc").take(20),
});

export const toggle = mutation({
  args: { id: v.id("integrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await ctx.db.get("integrations", args.id);
    if (!integration) throw new Error("Integration not found");
    const status = integration.status === "disconnected" ? (integration.key === "doordash" ? "demo" as const : "connected" as const) : "disconnected" as const;
    await ctx.db.patch("integrations", integration._id, { status, lastSyncAt: Date.now() });
    return null;
  },
});

export const prepareGoogleOAuth = mutation({
  args: {},
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx) => {
    const gmail = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "gmail"))
      .unique();
    if (!gmail) return { updated: false };
    await ctx.db.patch("integrations", gmail._id, {
      status: gmail.connectionKind === "oauth" ? gmail.status : "disconnected",
      syncMode: "polling",
      connectionKind: "oauth",
      permissions: ["Read email", "Send with approval"],
      capabilities: ["read_email", "reply_email"],
      description: gmail.connectionKind === "oauth"
        ? gmail.description
        : "Connect Gmail to evaluate real messages and draft confirmation-gated replies.",
    });
    return { updated: true };
  },
});

export const prepareCalendarOAuth = mutation({
  args: {},
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx) => {
    const calendar = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "calendar"))
      .unique();
    if (!calendar) return { updated: false };
    await ctx.db.patch("integrations", calendar._id, {
      status: calendar.connectionKind === "oauth" ? calendar.status : "disconnected",
      syncMode: "polling",
      connectionKind: "oauth",
      permissions: ["Read events", "Create with approval"],
      capabilities: ["read_events", "find_availability", "create_event"],
      description: calendar.connectionKind === "oauth"
        ? calendar.description
        : "Connect Google Calendar to surface upcoming events and create approved events.",
    });
    return { updated: true };
  },
});
