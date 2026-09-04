import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { runCodexStructured } from "@/lib/agent/codex";
import { calendarFetch } from "@/lib/google/client";

type CalendarDate = { date?: string; dateTime?: string; timeZone?: string };
type CalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: CalendarDate;
  end?: CalendarDate;
};
type CalendarList = { items?: CalendarEvent[] };
type Decision = {
  importance: number;
  confidence: number;
  urgency: number;
  reason: string;
  message: string;
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

function eventTime(value: CalendarDate | undefined) {
  const raw = value?.dateTime ?? value?.date;
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });

  const client = new ConvexHttpClient(convexUrl);
  try {
    const now = Date.now();
    const params = new URLSearchParams({
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "12",
    });
    const list = await calendarFetch<CalendarList>(`/calendars/primary/events?${params.toString()}`);
    let evaluated = 0;
    let surfaced = 0;
    let duplicates = 0;

    for (const item of list.items ?? []) {
      if (evaluated >= 4) break;
      if (item.status === "cancelled") continue;
      const startAt = eventTime(item.start);
      const endAt = eventTime(item.end);
      if (startAt === null) continue;
      const title = item.summary?.trim() || "Untitled calendar event";
      const normalized = {
        workspace: "personal" as const,
        externalId: item.id,
        integrationId: "calendar",
        type: "calendar.event_upcoming",
        timestamp: startAt,
        title,
        content: `${title} starts ${new Date(startAt).toISOString()}${endAt === null ? "" : ` and ends ${new Date(endAt).toISOString()}`}${item.location ? ` at ${item.location}` : ""}.`,
        metadataJson: JSON.stringify({
          start: item.start,
          end: item.end,
          location: item.location ?? null,
          htmlLink: item.htmlLink ?? null,
          allDay: Boolean(item.start?.date && !item.start.dateTime),
        }),
      };
      const ingested = await client.mutation(api.events.ingest, normalized);
      if (!ingested.created && ingested.decided) {
        duplicates += 1;
        continue;
      }
      evaluated += 1;
      const context = await client.query(api.agentContext.forChat, { workspace: "personal" });
      const prompt = `Evaluate this real upcoming Google Calendar event for Persona. Return independent 0–1 importance, confidence, and urgency scores. Optimize for precision: routine or distant events should usually remain quiet; events beginning soon or requiring preparation may be surfaced. Write a concise user-facing message without exposing email addresses. Do not propose or perform an external action. Do not use tools or inspect files.\n\nEVENT:\n${JSON.stringify(normalized)}\n\nMEMORY:\n${context.memories.join("\n")}`;
      const decision = await runCodexStructured<Decision>(prompt, "calendar-decision.schema.json");
      const saved = await client.mutation(api.events.recordDecision, {
        eventId: ingested.eventId as Id<"events">,
        importance: Math.max(0, Math.min(1, decision.importance)),
        confidence: Math.max(0, Math.min(1, decision.confidence)),
        urgency: Math.max(0, Math.min(1, decision.urgency)),
        reason: decision.reason,
        message: decision.message,
        sourceKind: "oauth",
      });
      if (saved.surfaced) surfaced += 1;
    }

    await client.mutation(api.oauth.markCalendarSynced, { cursor: list.items?.[0]?.id });
    return Response.json({ ok: true, evaluated, surfaced, duplicates, upcoming: list.items?.length ?? 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Calendar sync failed." }, { status: 500 });
  }
}
