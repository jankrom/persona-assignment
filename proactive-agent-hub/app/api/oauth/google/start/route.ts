import { randomBytes } from "node:crypto";
import { googleAuthorizationUrl } from "@/lib/google/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = randomBytes(32).toString("base64url");
    return new Response(null, {
      status: 307,
      headers: {
        Location: googleAuthorizationUrl(state),
        "Set-Cookie": `persona_google_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not start Google OAuth." }, { status: 500 });
  }
}
