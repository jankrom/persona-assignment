import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  integrations: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    key: v.string(),
    name: v.string(),
    status: v.union(v.literal("connected"), v.literal("demo"), v.literal("disconnected")),
    syncMode: v.union(v.literal("webhook"), v.literal("polling")),
    lastSyncAt: v.number(),
    permissions: v.array(v.string()),
    capabilities: v.array(v.string()),
    description: v.string(),
    sortOrder: v.number(),
    cursor: v.optional(v.string()),
    accountEmail: v.optional(v.union(v.string(), v.null())),
    connectionKind: v.optional(v.union(v.literal("demo"), v.literal("oauth"))),
  }).index("by_key", ["key"]).index("by_sortOrder", ["sortOrder"]).index("by_workspace_and_key", ["workspace", "key"]).index("by_workspace_and_sortOrder", ["workspace", "sortOrder"]),

  events: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    externalId: v.string(),
    dedupeKey: v.string(),
    integrationId: v.string(),
    type: v.string(),
    timestamp: v.number(),
    actorName: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    rawReference: v.optional(v.string()),
    metadataJson: v.string(),
  }).index("by_dedupeKey", ["dedupeKey"]).index("by_integrationId_and_timestamp", ["integrationId", "timestamp"]).index("by_workspace_and_timestamp", ["workspace", "timestamp"]).index("by_workspace_and_integrationId_and_timestamp", ["workspace", "integrationId", "timestamp"]),

  agentDecisions: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    eventId: v.id("events"),
    importance: v.number(),
    confidence: v.number(),
    urgency: v.number(),
    reason: v.string(),
    policy: v.union(v.literal("ignore"), v.literal("inbox"), v.literal("notify")),
    createdAt: v.number(),
  }).index("by_eventId", ["eventId"]).index("by_workspace_and_createdAt", ["workspace", "createdAt"]),

  inboxItems: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    eventId: v.optional(v.id("events")),
    integrationId: v.string(),
    createdAt: v.number(),
    importance: v.number(),
    confidence: v.number(),
    urgency: v.number(),
    status: v.union(v.literal("unread"), v.literal("read"), v.literal("dismissed"), v.literal("completed")),
    message: v.string(),
    reason: v.string(),
    policy: v.union(v.literal("inbox"), v.literal("notify")),
    proposedActionId: v.optional(v.id("actions")),
  }).index("by_createdAt", ["createdAt"]).index("by_status_and_createdAt", ["status", "createdAt"]).index("by_workspace_and_createdAt", ["workspace", "createdAt"]),

  actions: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    integrationId: v.string(),
    sourceKind: v.optional(v.union(v.literal("demo"), v.literal("oauth"))),
    type: v.string(),
    parametersJson: v.string(),
    summary: v.string(),
    editedSummary: v.optional(v.string()),
    status: v.union(v.literal("proposed"), v.literal("approved"), v.literal("executing"), v.literal("succeeded"), v.literal("failed")),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  }).index("by_idempotencyKey", ["idempotencyKey"]),

  actionResults: defineTable({
    actionId: v.id("actions"),
    success: v.boolean(),
    message: v.string(),
    completedAt: v.number(),
  }).index("by_actionId", ["actionId"]),

  conversations: defineTable({ workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))), key: v.string(), title: v.string(), updatedAt: v.number() }).index("by_key", ["key"]).index("by_workspace_and_key", ["workspace", "key"]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    toolLabel: v.optional(v.string()),
  }).index("by_conversationId_and_createdAt", ["conversationId", "createdAt"]),

  interactionLogs: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    itemId: v.optional(v.id("inboxItems")),
    type: v.string(),
    response: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  memories: defineTable({
    workspace: v.optional(v.union(v.literal("demo"), v.literal("personal"))),
    key: v.string(),
    scope: v.union(v.literal("global"), v.literal("integration")),
    integrationId: v.optional(v.string()),
    content: v.string(),
    updatedAt: v.number(),
    confidence: v.number(),
    evidenceCount: v.number(),
    sourceLabel: v.string(),
  }).index("by_key", ["key"]).index("by_scope", ["scope"]).index("by_integrationId", ["integrationId"]).index("by_workspace_and_key", ["workspace", "key"]).index("by_workspace_and_scope", ["workspace", "scope"]).index("by_workspace_and_integrationId", ["workspace", "integrationId"]),
});
