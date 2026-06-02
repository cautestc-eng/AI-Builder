import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePlan, sanitizePlan } from "@/lib/discord/validate";
import { executePlan } from "@/lib/discord/executor";
import { verifyRequest, stripIdentityFields } from "@/lib/auth";

export const maxDuration = 300;

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

    await supabase.from("guilds").upsert({
      id: guild_id,
      name: guild_id,
      owner_id: user.id,
      bot_installed: true,
    }, { onConflict: "id" }).maybeSingle();

    const { data: execution, error: executionError } = await supabase
      .from("executions")
      .insert({
        guild_id,
        version_id: version_id || null,
        status: "running",
        logs: [],
      })
      .select()
      .single();

    if (executionError) {
      return NextResponse.json({ error: executionError.message }, { status: 500 });
    }

    const result = await executePlan(guild_id, sanitized);

    await supabase
      .from("executions")
      .update({
        status: result.success ? "success" : "failed",
        logs: result.logs,
      })
      .eq("id", execution.id);

    if (result.success) {
      await supabase.from("server_versions").insert({
        guild_id,
        created_by: user.id,
        plan_json: sanitized,
        version_name: `v${Date.now()}`,
        execution_log: result.logs,
      });
    }

    return NextResponse.json({
      success: result.success,
      executionId: execution.id,
      logs: result.logs,
    });
  } catch (error) {
    console.error("Execution error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Execution failed",
    }, { status: 500 });
  }
}
