import { createAdminClient } from "@/lib/supabase/admin";

const DAILY_LIMIT = 10;

export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") {
    return { allowed: true, limit: DAILY_LIMIT, remaining: DAILY_LIMIT };
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
    return { allowed: count < DAILY_LIMIT, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - count };
  } catch {
    return { allowed: true, limit: DAILY_LIMIT, remaining: DAILY_LIMIT };
  }
}

export async function incrementRateLimit(userId: string): Promise<void> {
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
  } catch {
    // silently fail
  }
}
