import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const supabase = createAdminClient();

  const { data: guild } = await supabase
    .from("guilds")
    .select("*")
    .eq("id", guildId)
    .single();

  if (!guild) {
    return NextResponse.json({ error: "Guild not found" }, { status: 404 });
  }

  const { data: versions } = await supabase
    .from("server_versions")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false });

  const { data: executions } = await supabase
    .from("executions")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ guild, versions: versions || [], executions: executions || [] });
}
