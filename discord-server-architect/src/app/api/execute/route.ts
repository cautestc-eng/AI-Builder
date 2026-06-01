import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePlan, sanitizePlan } from "@/lib/discord/validate";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("discord_user_id")?.value;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { guild_id, plan_json, version_id } = body;

    if (!guild_id || !plan_json) {
      return NextResponse.json({ error: "guild_id and plan_json required" }, { status: 400 });
    }

    const validation = validatePlan(plan_json);
    if (!validation.valid) {
      return NextResponse.json({
        error: "Invalid plan",
        details: validation.errors,
      }, { status: 422 });
    }

    const sanitized = sanitizePlan(plan_json);
    const supabase = createAdminClient();

    const { data: execution, error: executionError } = await supabase
      .from("executions")
      .insert({
        guild_id,
        version_id: version_id || null,
        status: "pending",
        logs: [],
      })
      .select()
      .single();

    if (executionError) {
      return NextResponse.json({ error: executionError.message }, { status: 500 });
    }

    const botPayload = {
      guildId: guild_id,
      plan: sanitized,
      executionId: execution.id,
      token: process.env.DISCORD_BOT_TOKEN,
    };

    const botUrl = process.env.BOT_SERVICE_URL || "http://localhost:4000";

    const botRes = await fetch(`${botUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(botPayload),
      signal: AbortSignal.timeout(120000),
    });

    if (!botRes.ok) {
      const botError = await botRes.text();
      await supabase
        .from("executions")
        .update({ status: "failed", logs: [{ type: "error", message: botError, timestamp: new Date().toISOString() }] })
        .eq("id", execution.id);

      return NextResponse.json({ error: "Bot execution failed", details: botError }, { status: 500 });
    }

    const botResult = await botRes.json();

    await supabase
      .from("executions")
      .update({
        status: botResult.success ? "success" : "failed",
        logs: botResult.logs || [],
      })
      .eq("id", execution.id);

    if (botResult.success) {
      await supabase
        .from("server_versions")
        .insert({
          guild_id,
          created_by: userId,
          plan_json: sanitized,
          version_name: `v${Date.now()}`,
          execution_log: botResult.logs || [],
        });
    }

    return NextResponse.json({
      success: botResult.success,
      executionId: execution.id,
      logs: botResult.logs || [],
    });
  } catch (error) {
    console.error("Execution error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Execution failed",
    }, { status: 500 });
  }
}
