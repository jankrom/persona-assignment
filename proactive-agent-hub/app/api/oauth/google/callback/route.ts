import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { exchangeAuthorizationCode } from "@/lib/google/client";
import { loadGoogleCredentials, saveGoogleCredentials } from "@/lib/google/credentials";

export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function appUrl() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/oauth/google/callback";
  return new URL("/", redirectUri).toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expectedState = cookieValue(request, "persona_google_oauth_state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return Response.redirect(`${appUrl()}?view=connections&google=denied`);
  if (!state || !expectedState || state !== expectedState || !code) return Response.json({ error: "Invalid or expired OAuth state." }, { status: 400 });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return Response.json({ error: "Convex is not configured." }, { status: 500 });
  try {
    const tokens = await exchangeAuthorizationCode(code);
    const previous = await loadGoogleCredentials();
    const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Revoke the test grant and reconnect.");
    const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    const profileData = await profile.json() as { emailAddress?: string; error?: { message?: string } };
    if (!profile.ok || !profileData.emailAddress) throw new Error(profileData.error?.message || "Could not read the Gmail profile.");
    const scopes = tokens.scope?.split(" ").filter(Boolean) ?? previous?.scopes ?? [];
    await saveGoogleCredentials({ accessToken: tokens.access_token!, refreshToken, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000, email: profileData.emailAddress, scopes });
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.oauth.connectGoogle, { email: profileData.emailAddress, scopes });
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${appUrl()}?view=connections&google=connected`,
        "Set-Cookie": "persona_google_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "OAuth callback failed.");
    return Response.redirect(`${appUrl()}?view=connections&google=error&message=${message}`);
  }
}
