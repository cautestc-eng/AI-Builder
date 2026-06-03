import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePlan, sanitizePlan } from "@/lib/discord/validate";
import { executePlan } from "@/lib/discord/executor";
import { verifyRequest, stripIdentityFields } from "@/lib/auth";
import { checkPlanSafety } from "@/lib/safety";

export const maxDuration = 300;

const GUILD_COOLDOWN_SECONDS = 30;
const DAILY_EXECUTE_LIMIT = 20;

async function checkGuildCooldown(guildId: string): Promise<number | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") return null;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("executions")
      .select("created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.created_at) {
      const elapsed = (Date.now() - new Date(data.created_at).getTime()) / 1000;
      if (elapsed < GUILD_COOLDOWN_SECONDS) {
        return Math.ceil(GUILD_COOLDOWN_SECONDS - elapsed);
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function checkDailyExecuteLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") {
    return { allowed: true, remaining: DAILY_EXECUTE_LIMIT };
  }

  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from("rate_limits")
      .select("count")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    const count = data?.count ?? 0;
    return { allowed: count < DAILY_EXECUTE_LIMIT, remaining: DAILY_EXECUTE_LIMIT - count };
  } catch {
    return { allowed: true, remaining: DAILY_EXECUTE_LIMIT };
  }
}

async function incrementDailyExecuteLimit(userId: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") return;

  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from("rate_limits")
      .select("count")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (!data) {
      await supabase.from("rate_limits").insert({ user_id: userId, date: today, count: 1 });
    } else {
      await supabase.from("rate_limits").update({ count: data.count + 1 }).eq("user_id", userId).eq("date", today);
    }
  } catch {}
}

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

    const cooldown = await checkGuildCooldown(guild_id);
    if (cooldown !== null) {
      return NextResponse.json({
        error: `Please wait ${cooldown}s before executing again on this server`,
      }, { status: 429 });
    }

    const dailyLimit = await checkDailyExecuteLimit(user.id);
    if (!dailyLimit.allowed) {
      return NextResponse.json({
        error: `Daily execute limit reached (${DAILY_EXECUTE_LIMIT}/day)`,
      }, { status: 429 });
    }

    const validation = validatePlan(plan_json);
    if (!validation.valid) {
      return NextResponse.json({
        error: "Invalid plan",
        details: validation.errors,
      }, { status: 422 });
    }

    const planSafety = checkPlanSafety(plan_json);
    if (!planSafety.allowed) {
      return NextResponse.json({ error: planSafety.reason }, { status: 422 });
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
      await incrementDailyExecuteLimit(user.id);
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
