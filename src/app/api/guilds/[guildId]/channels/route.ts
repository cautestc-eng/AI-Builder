import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { guildId } = await params;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === "your_discord_bot_token" || token === "dummy_bot_token") {
    return NextResponse.json({ channels: [], roles: [] });
  }

  const headers = { Authorization: `Bot ${token}` };
  let channels: any[] = [];
  let roles: any[] = [];

  try {
    const [chRes, rlRes] = await Promise.all([
      fetch(`${DISCORD_API}/guilds/${guildId}/channels`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);
    if (chRes.ok) channels = await chRes.json();
    if (rlRes.ok) roles = await rlRes.json();
  } catch {}

  return NextResponse.json({
    channels: channels.map((c: any) => ({ id: c.id, name: c.name, type: c.type, managed: c.managed })),
    roles: roles.map((r: any) => ({ id: r.id, name: r.name, managed: r.managed })),
  });
}
