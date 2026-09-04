import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { runCodexStructured } from "@/lib/agent/codex";
import { gmailFetch } from "@/lib/google/client";
import type { Id } from "@/convex/_generated/dataModel";

type GmailList = { messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number };
type GmailMessage = { id: string; threadId: string; internalDate?: string; snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
type Decision = { importance: number; confidence: number; urgency: number; reason: string; message: string; proposedAction: null | { integrationId: string; type: string; summary: string; parametersJson: string } };

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });
  const client = new ConvexHttpClient(convexUrl);
  try {
    const list = await gmailFetch<GmailList>("/messages?maxResults=8&q=in%3Ainbox%20newer_than%3A1d%20-category%3Apromotions%20-category%3Asocial");
    let evaluated = 0;
    let surfaced = 0;
    let duplicates = 0;
    for (const item of list.messages ?? []) {
      if (evaluated >= 3) break;
      const message = await gmailFetch<GmailMessage>(`/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`);
      const from = header(message, "From");
      const subject = header(message, "Subject") || "No subject";
      const normalized = {
        workspace: "personal" as const,
        externalId: message.id,
        integrationId: "gmail",
        type: "gmail.email_received",
        timestamp: Number(message.internalDate ?? Date.now()),
        actorName: from || undefined,
        title: subject,
        content: (message.snippet ?? "").slice(0, 500),
        metadataJson: JSON.stringify({ threadId: message.threadId, from, subject, rfcMessageId: header(message, "Message-ID"), references: header(message, "References") }),
      };
      const ingested = await client.mutation(api.events.ingest, normalized);
      if (!ingested.created && ingested.decided) { duplicates += 1; continue; }
      evaluated += 1;
      const context = await client.query(api.agentContext.forChat, { workspace: "personal" });
      const prompt = `Evaluate this real Gmail event for Persona. Return independent 0–1 importance, confidence, and urgency scores. Optimize for precision. The application applies policy thresholds later. Never expose email addresses in the user-facing message. If a reply is clearly useful, proposedAction must use integrationId "gmail", type "reply_email", and parametersJson must be valid JSON containing only a concise "body" string. Otherwise proposedAction is null. Do not use tools or inspect files.\n\nEVENT:\n${JSON.stringify(normalized)}\n\nMEMORY:\n${context.memories.join("\n")}`;
      const decision = await runCodexStructured<Decision>(prompt, "decision.schema.json");
      let proposedAction = decision.proposedAction ?? undefined;
      if (proposedAction?.type === "reply_email") {
        const modelParameters = JSON.parse(proposedAction.parametersJson) as { body?: unknown };
        proposedAction = {
          integrationId: "gmail",
          type: "reply_email",
          summary: proposedAction.summary,
          parametersJson: JSON.stringify({ body: typeof modelParameters.body === "string" ? modelParameters.body : "", threadId: message.threadId, to: from, subject, inReplyTo: header(message, "Message-ID"), references: header(message, "References") }),
        };
      } else {
        proposedAction = undefined;
      }
      const saved = await client.mutation(api.events.recordDecision, { eventId: ingested.eventId as Id<"events">, importance: Math.max(0, Math.min(1, decision.importance)), confidence: Math.max(0, Math.min(1, decision.confidence)), urgency: Math.max(0, Math.min(1, decision.urgency)), reason: decision.reason, message: decision.message, sourceKind: "oauth", proposedAction });
      if (saved.surfaced) surfaced += 1;
    }
    await client.mutation(api.oauth.markGoogleSynced, { cursor: list.messages?.[0]?.id });
    return Response.json({ ok: true, evaluated, surfaced, duplicates });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gmail sync failed." }, { status: 500 });
  }
}
