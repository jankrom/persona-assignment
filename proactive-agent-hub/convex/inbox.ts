import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const actionStatus = v.union(v.literal("proposed"), v.literal("approved"), v.literal("executing"), v.literal("succeeded"), v.literal("failed"));
const itemStatus = v.union(v.literal("unread"), v.literal("read"), v.literal("dismissed"), v.literal("completed"));

export const list = query({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")), limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.id("inboxItems"), _creationTime: v.number(), workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))), eventId: v.optional(v.id("events")), integrationId: v.string(), createdAt: v.number(), importance: v.number(), confidence: v.number(), urgency: v.number(), status: itemStatus, message: v.string(), reason: v.string(), policy: v.union(v.literal("inbox"), v.literal("notify")), proposedActionId: v.optional(v.id("actions")),
    action: v.union(v.null(), v.object({ _id: v.id("actions"), type: v.string(), summary: v.string(), editedSummary: v.optional(v.string()), status: actionStatus })),
  })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("inboxItems").withIndex("by_workspace_and_createdAt", (q) => q.eq("workspace", args.workspace)).order("desc").take(Math.min(args.limit ?? 30, 50));
    return await Promise.all(rows.map(async (row) => {
      const action = row.proposedActionId ? await ctx.db.get("actions", row.proposedActionId) : null;
      return { ...row, action: action ? { _id: action._id, type: action.type, summary: action.summary, editedSummary: action.editedSummary, status: action.status } : null };
    }));
  },
});

export const summary = query({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")), since: v.number() },
  returns: v.object({ open: v.number(), timeSensitive: v.number(), filteredToday: v.number() }),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inboxItems")
      .withIndex("by_workspace_and_createdAt", (q) => q.eq("workspace", args.workspace))
      .order("desc")
      .take(500);
    const decisions = await ctx.db
      .query("agentDecisions")
      .withIndex("by_workspace_and_createdAt", (q) => q.eq("workspace", args.workspace).gte("createdAt", args.since))
      .take(500);
    const active = items.filter((item) => item.status === "unread" || item.status === "read");
    return {
      open: active.length,
      timeSensitive: active.filter((item) => item.policy === "notify").length,
      filteredToday: decisions.filter((decision) => decision.policy === "ignore").length,
    };
  },
});

export const listFiltered = query({
  args: {
    workspace: v.union(v.literal("demo"), v.literal("personal")),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.object({
    _id: v.id("agentDecisions"),
    eventId: v.id("events"),
    integrationId: v.string(),
    createdAt: v.number(),
    title: v.string(),
    content: v.string(),
    importance: v.number(),
    confidence: v.number(),
    urgency: v.number(),
    reason: v.string(),
  })),
  handler: async (ctx, args) => {
    const decisions = await ctx.db
      .query("agentDecisions")
      .withIndex("by_workspace_and_createdAt", (q) => q.eq("workspace", args.workspace).gte("createdAt", args.since))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 100));
    const filtered = [];
    for (const decision of decisions) {
      if (decision.policy !== "ignore") continue;
      const event = await ctx.db.get("events", decision.eventId);
      if (!event || (event.workspace ?? "demo") !== args.workspace) continue;
      filtered.push({
        _id: decision._id,
        eventId: event._id,
        integrationId: event.integrationId,
        createdAt: decision.createdAt,
        title: event.title,
        content: event.content,
        importance: decision.importance,
        confidence: decision.confidence,
        urgency: decision.urgency,
        reason: decision.reason,
      });
    }
    return filtered;
  },
});

export const respond = mutation({
  args: { itemId: v.id("inboxItems"), response: v.union(v.literal("approved"), v.literal("rejected"), v.literal("dismissed")), editedSummary: v.optional(v.string()) },
  returns: v.object({ success: v.boolean(), message: v.string(), requiresExecution: v.boolean(), executionIntegration: v.optional(v.union(v.literal("gmail"), v.literal("calendar"))) }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("inboxItems", args.itemId);
    if (!item) throw new Error("Inbox item not found");
    const now = Date.now();
    if (args.response === "approved" && item.proposedActionId) {
      const action = await ctx.db.get("actions", item.proposedActionId);
      if (!action) throw new Error("Proposed action not found");
      if (action.status === "succeeded") return { success: true, message: "This action was already completed.", requiresExecution: false };
      const integration = await ctx.db
        .query("integrations")
        .withIndex("by_workspace_and_key", (q) => q.eq("workspace", item.workspace ?? "demo").eq("key", action.integrationId))
        .unique();
      const isLiveGoogleAction = action.sourceKind === "oauth" &&
        integration?.connectionKind === "oauth" &&
        integration.status === "connected" &&
        ((action.integrationId === "gmail" && action.type === "reply_email") ||
          (action.integrationId === "calendar" && action.type === "create_event"));
      if (isLiveGoogleAction) {
        const executionIntegration = action.integrationId === "gmail" ? "gmail" as const : "calendar" as const;
        await ctx.db.patch("actions", action._id, { status: "approved", editedSummary: args.editedSummary });
        await ctx.db.patch("inboxItems", item._id, { status: "read" });
        await ctx.db.insert("interactionLogs", { workspace: item.workspace ?? "demo", itemId: item._id, type: args.editedSummary ? "action_edited" : "action_approved", response: "approved", detail: args.editedSummary, createdAt: now });
        return {
          success: true,
          message: action.integrationId === "gmail" ? "Approved. Sending through Gmail…" : "Approved. Creating the Calendar event…",
          requiresExecution: true,
          executionIntegration,
        };
      }
      await ctx.db.patch("actions", action._id, { status: "succeeded", editedSummary: args.editedSummary });
      const message = action.integrationId === "doordash" ? "Mock order placed. No charge was made." : action.integrationId === "gmail" ? "Demo reply sent successfully." : "Demo action completed successfully.";
      await ctx.db.insert("actionResults", { actionId: action._id, success: true, message, completedAt: now });
      await ctx.db.patch("inboxItems", item._id, { status: "completed" });
      await ctx.db.insert("interactionLogs", { workspace: item.workspace ?? "demo", itemId: item._id, type: args.editedSummary ? "action_edited" : "action_approved", response: "approved", detail: args.editedSummary, createdAt: now });
      return { success: true, message, requiresExecution: false };
    }
    await ctx.db.patch("inboxItems", item._id, { status: "dismissed" });
    if (item.proposedActionId) await ctx.db.patch("actions", item.proposedActionId, { status: "failed" });
    await ctx.db.insert("interactionLogs", { workspace: item.workspace ?? "demo", itemId: item._id, type: args.response === "dismissed" ? "item_dismissed" : "action_rejected", response: args.response, createdAt: now });
    return { success: true, message: "Got it. I’ll use that signal next time.", requiresExecution: false };
  },
});

export const getApprovedExecution = query({
  args: { itemId: v.id("inboxItems") },
  returns: v.union(v.null(), v.object({ actionId: v.id("actions"), integrationId: v.string(), type: v.string(), parametersJson: v.string(), summary: v.string(), editedSummary: v.optional(v.string()), status: actionStatus })),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("inboxItems", args.itemId);
    if (!item?.proposedActionId) return null;
    const action = await ctx.db.get("actions", item.proposedActionId);
    if (!action) return null;
    return { actionId: action._id, integrationId: action.integrationId, type: action.type, parametersJson: action.parametersJson, summary: action.summary, editedSummary: action.editedSummary, status: action.status };
  },
});

export const completeExecution = mutation({
  args: { itemId: v.id("inboxItems"), success: v.boolean(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("inboxItems", args.itemId);
    if (!item?.proposedActionId) throw new Error("Proposed action not found");
    const action = await ctx.db.get("actions", item.proposedActionId);
    if (!action) throw new Error("Action not found");
    await ctx.db.patch("actions", action._id, { status: args.success ? "succeeded" : "failed" });
    await ctx.db.patch("inboxItems", item._id, { status: args.success ? "completed" : "read" });
    await ctx.db.insert("actionResults", { actionId: action._id, success: args.success, message: args.message, completedAt: Date.now() });
    return null;
  },
});

export const markRead = mutation({
  args: { itemId: v.id("inboxItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("inboxItems", args.itemId);
    if (item?.status === "unread") await ctx.db.patch("inboxItems", item._id, { status: "read" });
    return null;
  },
});
