import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const guildId = searchParams.get("guild_id");

  const token = process.env.DISCORD_BOT_TOKEN;

  const botRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  const botUser = await botRes.json();

  const cookieStore = await cookies();
  const userId = cookieStore.get("discord_user_id")?.value;
  const accessToken = cookieStore.get("discord_access_token")?.value;

  let guildCheck: Record<string, any> | null = null;
  if (guildId) {
    const checkRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    guildCheck = {
      botInGuild: checkRes.ok,
      status: checkRes.status,
      body: checkRes.ok ? null : await checkRes.text().catch(() => "n/a"),
    };

    if (accessToken && guildCheck.botInGuild) {
      const memberRes = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${botUser.id}`,
        { headers: { Authorization: `Bot ${token}` } }
      );
      guildCheck.botMemberInGuild = memberRes.ok;
    }
  }

  return NextResponse.json({
    bot: { id: botUser.id, name: botUser.name },
    userId: userId || "not logged in",
    guildCheck,
    envVarsSet: {
      botToken: !!token && token !== "your_discord_bot_token" && token !== "dummy_bot_token",
      clientId: !!process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
    },
  });
}
