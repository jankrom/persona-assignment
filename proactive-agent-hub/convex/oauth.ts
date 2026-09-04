import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const connectGoogle = mutation({
  args: { email: v.string(), scopes: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasGmail = args.scopes.includes("https://www.googleapis.com/auth/gmail.readonly") &&
      args.scopes.includes("https://www.googleapis.com/auth/gmail.send");
    const hasCalendar = args.scopes.includes("https://www.googleapis.com/auth/calendar.events");
    const gmail = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "gmail"))
      .unique();
    const calendar = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "calendar"))
      .unique();
    if (!gmail) throw new Error("Gmail integration not found");
    if (!calendar) throw new Error("Calendar integration not found");
    await ctx.db.patch("integrations", gmail._id, {
      status: hasGmail ? "connected" : "disconnected",
      syncMode: "polling",
      lastSyncAt: Date.now(),
      accountEmail: args.email,
      connectionKind: "oauth",
      permissions: ["Read email", "Send with approval"],
      description: hasGmail
        ? `Reading real mail for ${args.email}. Replies require confirmation.`
        : "Reconnect Google to grant Gmail access.",
    });
    await ctx.db.patch("integrations", calendar._id, {
      status: hasCalendar ? "connected" : "disconnected",
      syncMode: "polling",
      lastSyncAt: Date.now(),
      accountEmail: args.email,
      connectionKind: "oauth",
      permissions: ["Read events", "Create with approval"],
      capabilities: ["read_events", "find_availability", "create_event"],
      description: hasCalendar
        ? `Reading the primary calendar for ${args.email}. Event creation requires confirmation.`
        : "Reconnect Google to grant Calendar access.",
    });
    return null;
  },
});

export const disconnectGoogle = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const gmail = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "gmail"))
      .unique();
    const calendar = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "calendar"))
      .unique();
    if (!gmail) throw new Error("Gmail integration not found");
    if (!calendar) throw new Error("Calendar integration not found");
    await ctx.db.patch("integrations", gmail._id, {
      status: "disconnected",
      lastSyncAt: Date.now(),
      accountEmail: null,
      connectionKind: "oauth",
      description: "Connect Gmail to evaluate real messages and draft confirmation-gated replies.",
    });
    await ctx.db.patch("integrations", calendar._id, {
      status: "disconnected",
      lastSyncAt: Date.now(),
      accountEmail: null,
      connectionKind: "oauth",
      description: "Connect Google Calendar to surface upcoming events and create approved events.",
    });
    return null;
  },
});

export const markGoogleSynced = mutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const gmail = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "gmail"))
      .unique();
    if (!gmail) throw new Error("Gmail integration not found");
    await ctx.db.patch("integrations", gmail._id, {
      lastSyncAt: Date.now(),
      cursor: args.cursor,
    });
    return null;
  },
});

export const markCalendarSynced = mutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const calendar = await ctx.db
      .query("integrations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "personal").eq("key", "calendar"))
      .unique();
    if (!calendar) throw new Error("Calendar integration not found");
    await ctx.db.patch("integrations", calendar._id, {
      lastSyncAt: Date.now(),
      cursor: args.cursor,
    });
    return null;
  },
});
