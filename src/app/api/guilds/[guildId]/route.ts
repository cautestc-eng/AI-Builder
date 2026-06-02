import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth";

export const maxDuration = 15;

const DISCORD_API = "https://discord.com/api/v10";

function getBotToken(): string | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === "your_discord_bot_token" || token === "dummy_bot_token") return null;
  return token;
}

async function checkBotInGuild(guildId: string): Promise<boolean> {
  const token = getBotToken();
  if (!token) return false;
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchGuildName(guildId: string): Promise<string | null> {
  const token = getBotToken();
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
  let verified;
  try {
    verified = await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { guildId } = await params;

  const botInstalled = await checkBotInGuild(guildId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") {
    let name = await fetchGuildName(guildId);
    if (!name && verified) {
      name = await fetchGuildNameViaUser(guildId, verified.discordAccessToken);
    }
    return NextResponse.json({
      guild: { id: guildId, name: name || guildId.slice(0, 8), bot_installed: botInstalled },
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
        guild: { ...guild, bot_installed: botInstalled },
        versions: versions || [],
        executions: executions || [],
      });
    }

    let name = await fetchGuildName(guildId);
    if (!name && verified) {
      name = await fetchGuildNameViaUser(guildId, verified.discordAccessToken);
    }
    return NextResponse.json({
      guild: guild || { id: guildId, name: name || guildId, bot_installed: botInstalled },
      versions: versions || [],
      executions: executions || [],
    });
  } catch {
    let name = await fetchGuildName(guildId);
    if (!name && verified) {
      name = await fetchGuildNameViaUser(guildId, verified.discordAccessToken);
    }
    return NextResponse.json({
      guild: { id: guildId, name: name || guildId.slice(0, 8), bot_installed: botInstalled },
      versions: [],
      executions: [],
    });
  }
}
