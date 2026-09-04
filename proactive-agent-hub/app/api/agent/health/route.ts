import { codexVersion } from "@/lib/agent/codex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ available: true, version: await codexVersion(), mode: "Local subscription" });
  } catch (error) {
    return Response.json({ available: false, error: error instanceof Error ? error.message : "Codex CLI not found" }, { status: 503 });
  }
}
