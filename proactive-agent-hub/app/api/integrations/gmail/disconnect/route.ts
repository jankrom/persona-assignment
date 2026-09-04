import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { clearGoogleCredentials, loadGoogleCredentials } from "@/lib/google/credentials";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !["localhost", "127.0.0.1", "::1"].includes(new URL(origin).hostname)) return Response.json({ error: "Local requests only." }, { status: 403 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });
  const credentials = await loadGoogleCredentials();
  if (credentials) {
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: credentials.refreshToken || credentials.accessToken }) }).catch(() => null);
  }
  await clearGoogleCredentials();
  await new ConvexHttpClient(convexUrl).mutation(api.oauth.disconnectGoogle, {});
  return Response.json({ ok: true });
}
