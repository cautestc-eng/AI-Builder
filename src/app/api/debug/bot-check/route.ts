import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  if (!token) {
    return NextResponse.json({ error: "DISCORD_BOT_TOKEN is not set" }, { status: 500 });
  }

  if (token === "your_discord_bot_token" || token === "dummy_bot_token") {
    return NextResponse.json({ error: "DISCORD_BOT_TOKEN is still the placeholder value" }, { status: 500 });
  }

  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({
      error: "Bot token is invalid or revoked",
      status: res.status,
      body: text,
    }, { status: 500 });
  }

  const botUser = await res.json();

  return NextResponse.json({
    success: true,
    bot: { id: botUser.id, name: botUser.username },
    clientId,
    match: botUser.id === clientId ? "yes" : "no (client_id and bot token must be from the same app)",
  });
}
