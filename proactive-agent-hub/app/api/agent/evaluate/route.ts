import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { runCodexStructured } from "@/lib/agent/codex";
import { integrations } from "@/lib/integrations/demo";

type Decision = {
  importance: number;
  confidence: number;
  urgency: number;
  reason: string;
  message: string;
  proposedAction: null | { integrationId: string; type: string; summary: string; parametersJson: string };
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });
  const client = new ConvexHttpClient(convexUrl);
  const event = {
    ...integrations.gmail.normalize({
      id: `demo_live_scheduling_${Date.now()}`,
      from: "Jordan Lee",
      subject: "Investor follow-up",
      body: "Could we move tomorrow’s investor check-in earlier? I can do 9:00 or 10:30.",
      timestamp: Date.now(),
    }),
    workspace: "demo" as const,
    metadataJson: JSON.stringify({ calendarAvailability: "10:30 available; 9:00 unavailable" }),
  };
  const ingested = await client.mutation(api.events.ingest, event);
  if (!ingested.created && ingested.decided) return Response.json({ ok: true, duplicate: true, message: "That event was already processed." });
  try {
    const context = await client.query(api.agentContext.forChat, { workspace: "demo" });
    const prompt = `Evaluate one normalized event for a proactive personal agent. Return independent 0–1 importance, confidence, and urgency scores. Optimize for precision: many events should be ignored. Policy is applied later by deterministic code. Write a concise user-facing message. You may propose only a confirmation-gated action. A cross-integration action must name the integration that executes it. Do not use tools or inspect files.\n\nEVENT:\n${JSON.stringify(event)}\n\nRELEVANT MEMORY:\n${context.memories.join("\n")}\n\nCONNECTED CAPABILITIES:\n${context.connections.join("\n")}`;
    const decision = await runCodexStructured<Decision>(prompt, "decision.schema.json");
    const saved = await client.mutation(api.events.recordDecision, {
      eventId: ingested.eventId,
      importance: Math.max(0, Math.min(1, decision.importance)),
      confidence: Math.max(0, Math.min(1, decision.confidence)),
      urgency: Math.max(0, Math.min(1, decision.urgency)),
      reason: decision.reason,
      message: decision.message,
      proposedAction: decision.proposedAction ?? undefined,
    });
    return Response.json({ ok: true, ...saved });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Evaluation failed." }, { status: 500 });
  }
}
