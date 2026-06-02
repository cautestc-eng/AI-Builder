import { NextRequest, NextResponse } from "next/server";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const guildId = searchParams.get("guildId");

  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 });
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === "your_discord_bot_token" || token === "dummy_bot_token") {
    return NextResponse.json({ installed: false, reason: "no_bot_token" });
  }

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    return NextResponse.json({ installed: res.ok });
  } catch {
    return NextResponse.json({ installed: false });
  }
}
