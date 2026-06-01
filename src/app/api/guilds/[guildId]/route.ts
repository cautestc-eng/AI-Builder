import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 15;

const DISCORD_API = "https://discord.com/api/v10";

async function fetchGuildName(guildId: string): Promise<string | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || null;
  } catch {
    return null;
  }
}

async function fetchGuildNameViaUser(guildId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const cookieStore = await cookies();
  const userId = cookieStore.get("discord_user_id")?.value;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") {
    let name = await fetchGuildName(guildId);
    if (!name && cookieStore.get("discord_access_token")?.value) {
      name = await fetchGuildNameViaUser(guildId, cookieStore.get("discord_access_token")!.value);
    }
    return NextResponse.json({
      guild: { id: guildId, name: name || guildId.slice(0, 8), bot_installed: true },
      versions: [],
      executions: [],
    });
  }

  try {
    const supabase = createAdminClient();

    const timeoutMs = 5000;
    const timeout = (ms: number) => new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    );

    const [guild, versions, executions] = await Promise.all([
      Promise.race([
        supabase.from("guilds").select("*").eq("id", guildId).single().then(r => r.data),
        timeout(timeoutMs),
      ]),
      Promise.race([
        supabase.from("server_versions").select("*").eq("guild_id", guildId)
          .order("created_at", { ascending: false }).then(r => r.data),
        timeout(timeoutMs),
      ]),
      Promise.race([
        supabase.from("executions").select("*").eq("guild_id", guildId)
          .order("created_at", { ascending: false }).limit(10).then(r => r.data),
        timeout(timeoutMs),
      ]),
    ]);

    if (guild && guild.name) {
      return NextResponse.json({
        guild,
        versions: versions || [],
        executions: executions || [],
      });
    }

    let name = await fetchGuildName(guildId);
    if (!name) {
      const at = cookieStore.get("discord_access_token")?.value;
      if (at) name = await fetchGuildNameViaUser(guildId, at);
    }
    return NextResponse.json({
      guild: guild || { id: guildId, name: name || guildId, bot_installed: true },
      versions: versions || [],
      executions: executions || [],
    });
  } catch {
    let name = await fetchGuildName(guildId);
    if (!name) {
      const at = cookieStore.get("discord_access_token")?.value;
      if (at) name = await fetchGuildNameViaUser(guildId, at);
    }
    return NextResponse.json({
      guild: { id: guildId, name: name || guildId.slice(0, 8), bot_installed: true },
      versions: [],
      executions: [],
    });
  }
}
