import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { gmailFetch } from "@/lib/google/client";

type ReplyParameters = { body?: unknown; threadId?: unknown; to?: unknown; subject?: unknown; inReplyTo?: unknown; references?: unknown };

function headerValue(value: unknown) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim() : "";
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const body = await request.json().catch(() => null) as { itemId?: unknown } | null;
  if (!body || typeof body.itemId !== "string") return Response.json({ error: "Missing inbox item." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });
  const client = new ConvexHttpClient(convexUrl);
  const itemId = body.itemId as Id<"inboxItems">;
  const action = await client.query(api.inbox.getApprovedExecution, { itemId });
  if (!action || action.status !== "approved" || action.integrationId !== "gmail" || action.type !== "reply_email") return Response.json({ error: "No approved Gmail reply is ready." }, { status: 409 });
  try {
    const parameters = JSON.parse(action.parametersJson) as ReplyParameters;
    const to = headerValue(parameters.to);
    const subject = headerValue(parameters.subject);
    const threadId = headerValue(parameters.threadId);
    const inReplyTo = headerValue(parameters.inReplyTo);
    const references = headerValue(parameters.references);
    const replyBody = action.editedSummary?.trim() || (typeof parameters.body === "string" ? parameters.body.trim() : "");
    if (!to || !threadId || !replyBody) throw new Error("The approved reply is missing a recipient, thread, or body.");
    const headers = [`To: ${to}`, `Subject: ${subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`}`, "Content-Type: text/plain; charset=utf-8"];
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
    if (references || inReplyTo) headers.push(`References: ${references || inReplyTo}`);
    const raw = base64Url(`${headers.join("\r\n")}\r\n\r\n${replyBody}`);
    await gmailFetch<{ id: string }>("/messages/send", { method: "POST", body: JSON.stringify({ raw, threadId }) });
    const message = "Reply sent through Gmail.";
    await client.mutation(api.inbox.completeExecution, { itemId, success: true, message });
    return Response.json({ ok: true, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail reply failed.";
    await client.mutation(api.inbox.completeExecution, { itemId, success: false, message });
    return Response.json({ error: message }, { status: 500 });
  }
}
