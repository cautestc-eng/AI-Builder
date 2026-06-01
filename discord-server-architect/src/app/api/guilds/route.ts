import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchGuilds, isOwner, canManageGuild, verifyBotInGuild } from "@/lib/discord/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("discord_access_token")?.value;
  const userId = cookieStore.get("discord_user_id")?.value;

  if (!accessToken || !userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const guilds = await fetchGuilds(accessToken);
  if (!guilds) {
    return NextResponse.json({ error: "Failed to fetch guilds" }, { status: 500 });
  }

  const supabase = createAdminClient();

  const accessibleGuilds = [];
  for (const guild of guilds) {
    const isUserOwner = isOwner(guild, userId);
    const canManage = canManageGuild(guild.permissions);

    if (!isUserOwner && !canManage) continue;

    const { data: guildData } = await supabase
      .from("guilds")
      .select("bot_installed")
      .eq("id", guild.id)
      .single();

    let botInstalled = guildData?.bot_installed ?? false;
    if (!botInstalled) {
      botInstalled = await verifyBotInGuild(guild.id);
      if (botInstalled) {
        await supabase.from("guilds").upsert({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner_id: guild.owner_id || userId,
          bot_installed: true,
        }, { onConflict: "id" });
      }
    }

    accessibleGuilds.push({
      ...guild,
      owner_id: guild.owner_id || userId,
      bot_installed: botInstalled,
    });
  }

  return NextResponse.json({ guilds: accessibleGuilds });
}
