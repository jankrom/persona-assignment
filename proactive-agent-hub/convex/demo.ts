import { v } from "convex/values";
import { mutation } from "./_generated/server";

const sampleOffsets: Record<string, number> = {
  message_sarah_104: 7 * 60_000,
  event_product_sync_42: 18 * 60_000,
  meal_trigger_182: 42 * 60_000,
};

export const resetInbox = mutation({
  args: {},
  returns: v.object({ open: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const items = await ctx.db
      .query("inboxItems")
      .withIndex("by_workspace_and_createdAt", (q) => q.eq("workspace", "demo"))
      .take(100);
    let open = 0;
    for (const item of items) {
      const event = item.eventId ? await ctx.db.get("events", item.eventId) : null;
      const offset = event ? sampleOffsets[event.externalId] : undefined;
      if (offset === undefined) {
        if (item.status === "unread" || item.status === "read") await ctx.db.patch("inboxItems", item._id, { status: "dismissed" });
        continue;
      }
      await ctx.db.patch("inboxItems", item._id, { status: "unread", createdAt: now - offset });
      if (item.proposedActionId) await ctx.db.patch("actions", item.proposedActionId, { status: "proposed" });
      open += 1;
    }
    return { open };
  },
});
