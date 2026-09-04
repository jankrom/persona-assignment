import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")) },
  returns: v.array(v.object({ _id: v.id("memories"), _creationTime: v.number(), workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))), key: v.string(), scope: v.union(v.literal("global"), v.literal("integration")), integrationId: v.optional(v.string()), content: v.string(), updatedAt: v.number(), confidence: v.number(), evidenceCount: v.number(), sourceLabel: v.string() })),
  handler: async (ctx, args) => await ctx.db.query("memories").withIndex("by_workspace_and_scope", (q) => q.eq("workspace", args.workspace)).take(50),
});

export const remove = mutation({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")), id: v.id("memories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const memory = await ctx.db.get("memories", args.id);
    if (!memory || memory.workspace !== args.workspace) throw new Error("Memory not found in this workspace");
    await ctx.db.delete("memories", memory._id);
    return null;
  },
});
