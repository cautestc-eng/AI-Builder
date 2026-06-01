import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchGuilds, isOwner, canManageGuild } from "@/lib/discord/oauth";
import { verifyBotInGuild } from "@/lib/discord/executor";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

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

  const owned = guilds.filter((g) => isOwner(g, userId) || canManageGuild(g.permissions));

  const { data: existingGuilds } = await supabase
    .from("guilds")
    .select("id, bot_installed")
    .in("id", owned.map((g) => g.id));

  const installedMap = new Map(
    (existingGuilds || []).map((g: any) => [g.id, g.bot_installed])
  );

  const needsCheck = owned.filter((g) => !installedMap.get(g.id));

  const results = await Promise.allSettled(
    needsCheck.map((g) => verifyBotInGuild(g.id))
  );

  for (let i = 0; i < needsCheck.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled") continue;
    if (r.value) {
      installedMap.set(needsCheck[i].id, true);
    }
  }

  const accessibleGuilds = owned.map((g) => ({
    ...g,
    owner_id: g.owner_id || userId,
    bot_installed: installedMap.get(g.id) ?? false,
  }));

  // Upsert all accessible guilds so names persist for detail page
  for (const g of accessibleGuilds) {
    await supabase.from("guilds").upsert({
      id: g.id,
      name: g.name,
      icon: g.icon,
      owner_id: g.owner_id || userId,
      bot_installed: g.bot_installed,
    }, { onConflict: "id" }).maybeSingle();
  }

  return NextResponse.json({ guilds: accessibleGuilds });
}
