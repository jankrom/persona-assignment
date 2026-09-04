import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const ingest = mutation({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")), externalId: v.string(), integrationId: v.string(), type: v.string(), timestamp: v.number(), actorName: v.optional(v.string()), title: v.string(), content: v.string(), metadataJson: v.string() },
  returns: v.object({ created: v.boolean(), decided: v.boolean(), eventId: v.id("events") }),
  handler: async (ctx, args) => {
    const dedupeKey = `${args.workspace}:${args.integrationId}:${args.externalId}`;
    const existing = await ctx.db.query("events").withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey)).unique();
    if (existing) {
      const decision = await ctx.db
        .query("agentDecisions")
        .withIndex("by_eventId", (q) => q.eq("eventId", existing._id))
        .unique();
      return { created: false, decided: decision !== null, eventId: existing._id };
    }
    const eventId = await ctx.db.insert("events", { ...args, dedupeKey });
    return { created: true, decided: false, eventId };
  },
});

export const recordDecision = mutation({
  args: {
    eventId: v.id("events"), importance: v.number(), confidence: v.number(), urgency: v.number(), reason: v.string(), message: v.string(),
    sourceKind: v.optional(v.union(v.literal("demo"), v.literal("oauth"))),
    proposedAction: v.optional(v.object({ integrationId: v.string(), type: v.string(), summary: v.string(), parametersJson: v.string() })),
  },
  returns: v.object({ policy: v.string(), surfaced: v.boolean() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) throw new Error("Event not found");
    const existing = await ctx.db.query("agentDecisions").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).unique();
    if (existing) return { policy: existing.policy, surfaced: existing.policy !== "ignore" };
    const policy = args.importance < 0.5 ? "ignore" as const : args.importance >= 0.8 && args.urgency >= 0.7 && args.confidence >= 0.7 ? "notify" as const : "inbox" as const;
    const now = Date.now();
    const workspace = event.workspace ?? "demo";
    await ctx.db.insert("agentDecisions", { workspace, eventId: event._id, importance: args.importance, confidence: args.confidence, urgency: args.urgency, reason: args.reason, policy, createdAt: now });
    if (policy === "ignore") return { policy, surfaced: false };
    let proposedActionId;
    if (args.proposedAction) {
      proposedActionId = await ctx.db.insert("actions", { workspace, integrationId: args.proposedAction.integrationId, sourceKind: args.sourceKind, type: args.proposedAction.type, parametersJson: args.proposedAction.parametersJson, summary: args.proposedAction.summary, status: "proposed", idempotencyKey: `${event.dedupeKey}:${args.proposedAction.integrationId}:${args.proposedAction.type}`, createdAt: now });
    }
    await ctx.db.insert("inboxItems", { workspace, eventId: event._id, integrationId: event.integrationId, createdAt: now, importance: args.importance, confidence: args.confidence, urgency: args.urgency, status: "unread", message: args.message, reason: args.reason, policy, proposedActionId });
    return { policy, surfaced: true };
  },
});
