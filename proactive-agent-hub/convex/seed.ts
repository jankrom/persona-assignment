import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

type SeedItem = {
  externalId: string;
  integrationId: string;
  type: string;
  timestamp: number;
  actorName?: string;
  title: string;
  content: string;
  importance: number;
  confidence: number;
  urgency: number;
  reason: string;
  message: string;
  action?: { type: string; summary: string; parameters: Record<string, string> };
};

async function insertSeedItem(ctx: MutationCtx, item: SeedItem) {
  const eventId = await ctx.db.insert("events", {
    workspace: "demo",
    externalId: item.externalId,
    dedupeKey: `demo:${item.integrationId}:${item.externalId}`,
    integrationId: item.integrationId,
    type: item.type,
    timestamp: item.timestamp,
    actorName: item.actorName,
    title: item.title,
    content: item.content,
    metadataJson: "{}",
  });
  const policy = item.importance < 0.5 ? "ignore" as const : item.importance >= 0.8 && item.urgency >= 0.7 && item.confidence >= 0.7 ? "notify" as const : "inbox" as const;
  await ctx.db.insert("agentDecisions", { workspace: "demo", eventId, importance: item.importance, confidence: item.confidence, urgency: item.urgency, reason: item.reason, policy, createdAt: item.timestamp + 250 });
  if (policy === "ignore") return;
  let proposedActionId;
  if (item.action) {
    proposedActionId = await ctx.db.insert("actions", {
      workspace: "demo",
      integrationId: item.integrationId,
      sourceKind: "demo",
      type: item.action.type,
      parametersJson: JSON.stringify(item.action.parameters),
      summary: item.action.summary,
      status: "proposed",
      idempotencyKey: `demo:${item.integrationId}:${item.externalId}:${item.action.type}`,
      createdAt: item.timestamp + 300,
    });
  }
  await ctx.db.insert("inboxItems", { workspace: "demo", eventId, integrationId: item.integrationId, createdAt: item.timestamp + 500, importance: item.importance, confidence: item.confidence, urgency: item.urgency, status: "unread", message: item.message, reason: item.reason, policy, proposedActionId });
}

export const demo = mutation({
  args: {},
  returns: v.object({ seeded: v.boolean() }),
  handler: async (ctx) => {
    const existing = await ctx.db.query("integrations").withIndex("by_workspace_and_key", (q) => q.eq("workspace", "demo").eq("key", "gmail")).unique();
    if (existing) return { seeded: false };
    const now = Date.now();
    const integrations = [
      { workspace: "demo" as const, key: "gmail", name: "Gmail", status: "demo" as const, syncMode: "polling" as const, lastSyncAt: now - 12_000, permissions: ["Read mock email", "Mock replies"], capabilities: ["read_email", "reply_email"], description: "Populated demo mailbox with realistic sample signals.", sortOrder: 1, connectionKind: "demo" as const },
      { workspace: "demo" as const, key: "calendar", name: "Google Calendar", status: "demo" as const, syncMode: "polling" as const, lastSyncAt: now - 8_000, permissions: ["Read mock events", "Mock event creation"], capabilities: ["read_events", "find_availability", "create_event"], description: "Populated demo calendar with realistic sample events.", sortOrder: 2, connectionKind: "demo" as const },
      { workspace: "demo" as const, key: "doordash", name: "DoorDash", status: "demo" as const, syncMode: "polling" as const, lastSyncAt: now - 21_000, permissions: ["Read mock history", "Place mock order with approval"], capabilities: ["read_order_history", "place_mock_order"], description: "Demo adapter only. No real orders or charges.", sortOrder: 3, cursor: "mock_event_182", connectionKind: "demo" as const },
    ];
    for (const integration of integrations) await ctx.db.insert("integrations", integration);
    await ctx.db.insert("integrations", { workspace: "personal", key: "gmail", name: "Gmail", status: "disconnected", syncMode: "polling", lastSyncAt: now, permissions: ["Read email", "Send with approval"], capabilities: ["read_email", "reply_email"], description: "Connect Gmail to evaluate real messages and draft confirmation-gated replies.", sortOrder: 1, connectionKind: "oauth" });
    await ctx.db.insert("integrations", { workspace: "personal", key: "calendar", name: "Google Calendar", status: "disconnected", syncMode: "polling", lastSyncAt: now, permissions: ["Read events", "Create with approval"], capabilities: ["read_events", "find_availability", "create_event"], description: "Connect Google Calendar to surface upcoming events and create approved events.", sortOrder: 2, connectionKind: "oauth" });
    const memories = [
      { key: "global:concise", scope: "global" as const, content: "Keep updates concise and lead with the decision the user needs to make.", confidence: 0.96, evidenceCount: 12, sourceLabel: "12 interactions" },
      { key: "gmail:promotions", scope: "integration" as const, integrationId: "gmail", content: "Do not surface promotional newsletters unless they affect an active purchase.", confidence: 0.94, evidenceCount: 8, sourceLabel: "8 dismissals" },
      { key: "calendar:duration", scope: "integration" as const, integrationId: "calendar", content: "Default external meetings to 30 minutes and avoid scheduling before 9:30 AM.", confidence: 0.88, evidenceCount: 6, sourceLabel: "4 edits · 2 approvals" },
      { key: "doordash:lunch", scope: "integration" as const, integrationId: "doordash", content: "Sweetgreen is a frequent weekday lunch choice between noon and 1 PM.", confidence: 0.82, evidenceCount: 5, sourceLabel: "5 accepted suggestions" },
    ];
    for (const memory of memories) await ctx.db.insert("memories", { workspace: "demo", ...memory, updatedAt: now - 86_400_000 });

    await insertSeedItem(ctx, { externalId: "message_sarah_104", integrationId: "gmail", type: "gmail.email_received", timestamp: now - 7 * 60_000, actorName: "Sarah Chen", title: "Re: Product review", content: "Are you free Thursday afternoon to review the launch plan?", importance: 0.78, confidence: 0.94, urgency: 0.4, reason: "Direct scheduling request from a frequent collaborator. Calendar is open after 3 PM.", message: "Sarah asked if you're free Thursday afternoon. Your calendar is open after 3 PM.", action: { type: "reply_email", summary: "Reply: “I’m available Thursday at 3:30 PM.”", parameters: { threadId: "thread_104", body: "I’m available Thursday at 3:30 PM." } } });
    await insertSeedItem(ctx, { externalId: "event_product_sync_42", integrationId: "calendar", type: "calendar.event_starting", timestamp: now - 18 * 60_000, title: "Product sync", content: "Product sync starts in 28 minutes.", importance: 0.91, confidence: 0.98, urgency: 0.86, reason: "The meeting starts soon and the linked email thread contains an unresolved pricing decision.", message: "Product sync starts in 28 minutes. The open question from the email thread is launch pricing." });
    await insertSeedItem(ctx, { externalId: "meal_trigger_182", integrationId: "doordash", type: "doordash.meal_time_trigger", timestamp: now - 42 * 60_000, title: "Usual lunch window", content: "Weekday lunch window and prior Sweetgreen pattern detected.", importance: 0.68, confidence: 0.86, urgency: 0.44, reason: "Five accepted Sweetgreen suggestions make this useful, but it is not interrupt-worthy.", message: "You often order Sweetgreen around this time. Reorder your usual Harvest Bowl?", action: { type: "place_mock_order", summary: "Place mock order · Harvest Bowl · $16.42", parameters: { restaurant: "Sweetgreen", item: "Harvest Bowl", total: "$16.42" } } });
    await insertSeedItem(ctx, { externalId: "promo_weekend_9", integrationId: "gmail", type: "gmail.email_received", timestamp: now - 57 * 60_000, actorName: "Weekend Deals", title: "20% off this weekend", content: "Seasonal promotion.", importance: 0.12, confidence: 0.99, urgency: 0.15, reason: "Promotional content was down-ranked by the learned Gmail preference.", message: "A promotional email was filtered." });

    const conversationId = await ctx.db.insert("conversations", { workspace: "demo", key: "default", title: "Persona", updatedAt: now });
    await ctx.db.insert("messages", { conversationId, role: "assistant", content: "Morning. I filtered 12 low-value signals and kept three things worth a look. What can I take care of?", createdAt: now - 2 * 60_000, toolLabel: "Context synced" });
    return { seeded: true };
  },
});

export const rebrandPersona = mutation({
  args: {},
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_and_key", (q) => q.eq("workspace", "demo").eq("key", "default"))
      .unique();
    if (!conversation || conversation.title === "Persona") return { updated: false };
    await ctx.db.patch("conversations", conversation._id, {
      title: "Persona",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});
