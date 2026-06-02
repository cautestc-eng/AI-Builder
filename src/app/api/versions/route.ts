import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePlan } from "@/lib/discord/validate";
import { verifyRequest, stripIdentityFields } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let verified;
  try {
    verified = await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { user } = verified;

  try {
    const rawBody = await req.json();
    const body = stripIdentityFields(rawBody) as any;
    const { guild_id, plan_json, version_name } = body;

    if (!guild_id || !plan_json) {
      return NextResponse.json({ error: "guild_id and plan_json are required" }, { status: 400 });
    }

    const validation = validatePlan(plan_json);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid plan", details: validation.errors }, { status: 422 });
    }

    const supabase = createAdminClient();

    const { data: version, error } = await supabase
      .from("server_versions")
      .insert({
        guild_id,
        created_by: user.id,
        plan_json,
        version_name: version_name || `v${Date.now()}`,
        execution_log: [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ version });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to create version",
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  let verified;
  try {
    verified = await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const guildId = searchParams.get("guild_id");

  if (!guildId) {
    return NextResponse.json({ error: "guild_id query param required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: versions, error } = await supabase
    .from("server_versions")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: versions || [] });
}
