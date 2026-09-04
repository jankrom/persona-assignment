import { loadGoogleCredentials, saveGoogleCredentials } from "./credentials";

const tokenEndpoint = "https://oauth2.googleapis.com/token";

export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GoogleApiError";
  }
}

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google OAuth environment variables are incomplete.");
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code: string) {
  const { clientId, clientSecret, redirectUri } = config();
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google token exchange failed.");
  return result;
}

export async function validGoogleAccessToken() {
  const credentials = await loadGoogleCredentials();
  if (!credentials) throw new Error("Google is not connected.");
  if (credentials.expiresAt > Date.now() + 60_000) return credentials.accessToken;
  if (!credentials.refreshToken) throw new Error("Google did not provide a refresh token. Reconnect Google.");
  const { clientId, clientSecret } = config();
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google token refresh failed.");
  await saveGoogleCredentials({ ...credentials, accessToken: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 });
  return result.access_token;
}

export async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await validGoogleAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init?.headers },
  });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new GoogleApiError(result.error?.message || `Gmail API request failed (${response.status}).`, response.status);
  return result;
}

export async function calendarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await validGoogleAccessToken();
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init?.headers },
  });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new GoogleApiError(result.error?.message || `Google Calendar API request failed (${response.status}).`, response.status);
  return result;
}
