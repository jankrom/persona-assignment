import { v } from "convex/values";
import { query } from "./_generated/server";

export const forChat = query({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")) },
  returns: v.object({ memories: v.array(v.string()), connections: v.array(v.string()), inbox: v.array(v.string()), upcomingEvents: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const memories = await ctx.db.query("memories").withIndex("by_workspace_and_scope", (q) => q.eq("workspace", args.workspace)).take(30);
    const integrations = await ctx.db.query("integrations").withIndex("by_workspace_and_sortOrder", (q) => q.eq("workspace", args.workspace)).take(20);
    const inbox = await ctx.db.query("inboxItems").withIndex("by_workspace_and_createdAt", (q) => q.eq("workspace", args.workspace)).order("desc").take(10);
    const upcomingEvents = await ctx.db
      .query("events")
      .withIndex("by_workspace_and_integrationId_and_timestamp", (q) => q.eq("workspace", args.workspace).eq("integrationId", "calendar").gte("timestamp", Date.now()))
      .order("asc")
      .take(20);
    return {
      memories: memories.map((memory) => memory.content),
      connections: integrations.map((integration) => `${integration.name}: ${integration.status}; ${integration.capabilities.join(", ")}`),
      inbox: inbox.map((item) => `${item.integrationId}: ${item.message}`),
      upcomingEvents: upcomingEvents.map((event) => `${new Date(event.timestamp).toISOString()} — ${event.title}: ${event.content}`),
    };
  },
});
