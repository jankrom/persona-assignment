import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { runCodexStructured } from "@/lib/agent/codex";

type AgentReply = {
  reply: string;
  learnedPreference: string | null;
  toolLabel: string | null;
  proposedAction: null | {
    integrationId: "calendar";
    type: "create_event";
    summary: string;
    parametersJson: string;
  };
};

function isLocalRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const body = await request.json().catch(() => null) as { message?: unknown; workspace?: unknown } | null;
  if (!body || typeof body.message !== "string" || !body.message.trim() || body.message.length > 4_000 || (body.workspace !== "demo" && body.workspace !== "personal")) {
    return Response.json({ error: "Message must be between 1 and 4,000 characters." }, { status: 400 });
  }
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });
  const client = new ConvexHttpClient(convexUrl);
  const message = body.message.trim();
  const workspace = body.workspace;
  const userMessageId = await client.mutation(api.chat.addUserMessage, { workspace, content: message });
  try {
    const context = await client.query(api.agentContext.forChat, { workspace });
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const prompt = `You are Persona, a precise proactive personal agent. Answer concisely and naturally. You are operating in the ${workspace === "demo" ? "populated demonstration" : "personal live-data"} workspace. You share one memory and tool context across proactive Inbox and Chat. Never claim an external write happened. If the user explicitly asks to schedule or create a calendar event and supplies an unambiguous title, date, start time, and duration or end time, set proposedAction to a calendar create_event. parametersJson must be valid JSON with string fields title, start, end, timeZone, and optional location and description. start and end must be RFC3339 timestamps with offsets. Check the supplied upcoming calendar context for obvious conflicts. The action summary must clearly state the event title and local date/time, and the reply must say approval is waiting in the Inbox. ${workspace === "demo" ? "Approved actions in this workspace are simulations only." : "Approved actions in this workspace use the connected Google account."} If details are ambiguous, ask a concise follow-up and return null. All other external writes must only be discussed and proposedAction must be null. If the user explicitly states a durable preference, copy only that preference into learnedPreference; otherwise return null. toolLabel should briefly name context you actually used, or null. Do not use tools or inspect files.\n\nCURRENT TIME: ${now.toISOString()}\nTIME ZONE: ${timeZone}\n\nMEMORY:\n${context.memories.join("\n")}\n\nCONNECTIONS:\n${context.connections.join("\n")}\n\nUPCOMING CALENDAR:\n${context.upcomingEvents.join("\n") || "No synced upcoming events."}\n\nCURRENT INBOX:\n${context.inbox.join("\n")}\n\nUSER:\n${message}`;
    const result = await runCodexStructured<AgentReply>(prompt, "chat.schema.json");
    if (!result.reply?.trim()) throw new Error("The local agent returned an empty reply.");
    await client.mutation(api.chat.addAssistantMessage, {
      content: result.reply.trim(),
      toolLabel: result.toolLabel?.trim() || undefined,
      learnedPreference: result.learnedPreference?.trim() || undefined,
      workspace,
      userMessageId,
      proposedAction: result.proposedAction ?? undefined,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "The local agent failed.";
    await client.mutation(api.chat.addAssistantMessage, { workspace, content: `I couldn't reach the local Codex runtime. ${messageText}`, toolLabel: "Local runtime error" });
    return Response.json({ error: messageText }, { status: 500 });
  }
}
