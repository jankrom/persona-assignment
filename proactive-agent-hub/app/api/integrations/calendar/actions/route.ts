import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { calendarFetch, GoogleApiError } from "@/lib/google/client";

type CreateEventParameters = {
  title?: unknown;
  start?: unknown;
  end?: unknown;
  timeZone?: unknown;
  location?: unknown;
  description?: unknown;
};
type CreatedEvent = { id: string; htmlLink?: string };

function isLocalRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const body = await request.json().catch(() => null) as { itemId?: unknown } | null;
  if (!body || typeof body.itemId !== "string") return Response.json({ error: "Missing inbox item." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });

  const client = new ConvexHttpClient(convexUrl);
  const itemId = body.itemId as Id<"inboxItems">;
  const action = await client.query(api.inbox.getApprovedExecution, { itemId });
  if (!action || action.status !== "approved" || action.integrationId !== "calendar" || action.type !== "create_event") {
    return Response.json({ error: "No approved Calendar event is ready." }, { status: 409 });
  }

  try {
    const parameters = JSON.parse(action.parametersJson) as CreateEventParameters;
    const title = optionalText(parameters.title, 200);
    const start = optionalText(parameters.start, 80);
    const end = optionalText(parameters.end, 80);
    const timeZone = optionalText(parameters.timeZone, 80);
    const location = optionalText(parameters.location, 300);
    const description = optionalText(parameters.description, 2_000);
    const startAt = Date.parse(start);
    const endAt = Date.parse(end);
    if (!title || !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
      throw new Error("The approved event needs a valid title, start time, and end time.");
    }
    if (endAt - startAt > 24 * 60 * 60 * 1000) throw new Error("Persona only creates events up to 24 hours long.");
    if (startAt < Date.now() - 5 * 60_000 || startAt > Date.now() + 2 * 365 * 24 * 60 * 60 * 1000) {
      throw new Error("The approved event start time is outside the supported range.");
    }

    const eventId = `persona${createHash("sha256").update(action.actionId).digest("hex")}`;
    try {
      await calendarFetch<CreatedEvent>("/calendars/primary/events?sendUpdates=none", {
        method: "POST",
        body: JSON.stringify({
          id: eventId,
          summary: title,
          start: { dateTime: new Date(startAt).toISOString(), ...(timeZone ? { timeZone } : {}) },
          end: { dateTime: new Date(endAt).toISOString(), ...(timeZone ? { timeZone } : {}) },
          ...(location ? { location } : {}),
          ...(description ? { description } : {}),
          extendedProperties: { private: { personaActionId: action.actionId } },
        }),
      });
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    }
    const message = `Created “${title}” in Google Calendar.`;
    await client.mutation(api.inbox.completeExecution, { itemId, success: true, message });
    return Response.json({ ok: true, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar event creation failed.";
    await client.mutation(api.inbox.completeExecution, { itemId, success: false, message });
    return Response.json({ error: message }, { status: 500 });
  }
}
