import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listMessages = query({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")), limit: v.optional(v.number()) },
  returns: v.array(v.object({ _id: v.id("messages"), _creationTime: v.number(), conversationId: v.id("conversations"), role: v.union(v.literal("user"), v.literal("assistant")), content: v.string(), createdAt: v.number(), toolLabel: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.query("conversations").withIndex("by_workspace_and_key", (q) => q.eq("workspace", args.workspace).eq("key", "default")).unique();
    if (!conversation) return [];
    const rows = await ctx.db.query("messages").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", conversation._id)).order("desc").take(Math.min(args.limit ?? 40, 80));
    return rows.reverse();
  },
});

export const addUserMessage = mutation({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")), content: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    let conversation = await ctx.db.query("conversations").withIndex("by_workspace_and_key", (q) => q.eq("workspace", args.workspace).eq("key", "default")).unique();
    if (!conversation) {
      const id = await ctx.db.insert("conversations", { workspace: args.workspace, key: "default", title: "Persona", updatedAt: Date.now() });
      conversation = await ctx.db.get("conversations", id);
    }
    if (!conversation) throw new Error("Could not create conversation");
    const now = Date.now();
    await ctx.db.patch("conversations", conversation._id, { updatedAt: now });
    return await ctx.db.insert("messages", { conversationId: conversation._id, role: "user", content: args.content, createdAt: now });
  },
});

export const addAssistantMessage = mutation({
  args: {
    content: v.string(),
    toolLabel: v.optional(v.string()),
    learnedPreference: v.optional(v.string()),
    workspace: v.union(v.literal("demo"), v.literal("personal")),
    userMessageId: v.optional(v.id("messages")),
    proposedAction: v.optional(v.object({
      integrationId: v.literal("calendar"),
      type: v.literal("create_event"),
      summary: v.string(),
      parametersJson: v.string(),
    })),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.query("conversations").withIndex("by_workspace_and_key", (q) => q.eq("workspace", args.workspace).eq("key", "default")).unique();
    if (!conversation) throw new Error("Conversation not found");
    const now = Date.now();
    await ctx.db.patch("conversations", conversation._id, { updatedAt: now });
    const messageId = await ctx.db.insert("messages", { conversationId: conversation._id, role: "assistant", content: args.content, createdAt: now, toolLabel: args.toolLabel });
    if (args.proposedAction) {
      if (!args.userMessageId) throw new Error("A proposed action requires its originating user message");
      const userMessage = await ctx.db.get("messages", args.userMessageId);
      if (!userMessage || userMessage.role !== "user" || userMessage.conversationId !== conversation._id) throw new Error("Invalid originating user message");
      const calendar = await ctx.db.query("integrations").withIndex("by_workspace_and_key", (q) => q.eq("workspace", args.workspace).eq("key", "calendar")).unique();
      if (!calendar || (args.workspace === "personal" && (calendar.status !== "connected" || calendar.connectionKind !== "oauth"))) throw new Error("Google Calendar is not connected");
      const parameters = JSON.parse(args.proposedAction.parametersJson) as Record<string, unknown>;
      if (typeof parameters.title !== "string" || typeof parameters.start !== "string" || typeof parameters.end !== "string" || typeof parameters.timeZone !== "string") {
        throw new Error("The proposed Calendar action is missing required fields");
      }
      const idempotencyKey = `chat:${args.userMessageId}:calendar:create_event`;
      const existing = await ctx.db.query("actions").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
      if (!existing) {
        const actionId = await ctx.db.insert("actions", {
          workspace: args.workspace,
          integrationId: "calendar",
          sourceKind: args.workspace === "personal" ? "oauth" : "demo",
          type: "create_event",
          parametersJson: args.proposedAction.parametersJson,
          summary: args.proposedAction.summary.slice(0, 500),
          status: "proposed",
          idempotencyKey,
          createdAt: now,
        });
        await ctx.db.insert("inboxItems", {
          workspace: args.workspace,
          integrationId: "calendar",
          createdAt: now,
          importance: 1,
          confidence: 1,
          urgency: 0.5,
          status: "unread",
          message: "Persona prepared a Google Calendar event for your approval.",
          reason: "You requested this event in Chat. Calendar writes always require explicit approval.",
          policy: "inbox",
          proposedActionId: actionId,
        });
      }
    }
    if (args.learnedPreference) {
      const key = `explicit:${args.learnedPreference.toLowerCase().slice(0, 80)}`;
      const existing = await ctx.db.query("memories").withIndex("by_workspace_and_key", (q) => q.eq("workspace", args.workspace).eq("key", key)).unique();
      if (existing) await ctx.db.patch("memories", existing._id, { content: args.learnedPreference, updatedAt: now, confidence: 0.99, evidenceCount: existing.evidenceCount + 1, sourceLabel: "Explicit preference" });
      else await ctx.db.insert("memories", { workspace: args.workspace, key, scope: "global", content: args.learnedPreference, updatedAt: now, confidence: 0.99, evidenceCount: 1, sourceLabel: "Explicit preference" });
    }
    return messageId;
  },
});

export const clearConversation = mutation({
  args: { workspace: v.union(v.literal("demo"), v.literal("personal")) },
  returns: v.object({ cleared: v.number() }),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.query("conversations").withIndex("by_workspace_and_key", (q) => q.eq("workspace", args.workspace).eq("key", "default")).unique();
    if (!conversation) return { cleared: 0 };
    const messages = await ctx.db.query("messages").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", conversation._id)).take(501);
    if (messages.length > 500) throw new Error("This conversation is too large to clear in one operation");
    for (const message of messages) await ctx.db.delete("messages", message._id);
    await ctx.db.delete("conversations", conversation._id);
    return { cleared: messages.length };
  },
});
