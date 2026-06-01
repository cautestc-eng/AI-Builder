import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 15;

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
    return NextResponse.json({
      guild: { id: guildId, bot_installed: true },
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

    return NextResponse.json({
      guild: guild || { id: guildId, bot_installed: true },
      versions: versions || [],
      executions: executions || [],
    });
  } catch {
    return NextResponse.json({
      guild: { id: guildId, bot_installed: true },
      versions: [],
      executions: [],
    });
  }
}
