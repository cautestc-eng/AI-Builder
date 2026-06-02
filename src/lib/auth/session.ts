import { createAdminClient } from "@/lib/supabase/admin";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface SessionUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface SessionData {
  id: string;
  user_id: string;
  discord_access_token: string;
  expires_at: string;
  revoked: boolean;
  user: SessionUser;
}

export async function createSession(
  userId: string,
  accessToken: string,
  ipAddress?: string
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") {
    throw new Error("Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createAdminClient();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      discord_access_token: accessToken,
      expires_at: expiresAt,
      ip_address: ipAddress || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create session:", error);
    throw new Error("Failed to create session");
  }

  return data.id;
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, user_id, discord_access_token, expires_at, revoked, users!inner(id, username, avatar)")
    .eq("id", sessionId)
    .single();

  if (error || !data) return null;

  if (data.revoked) return null;

  const now = new Date();
  if (new Date(data.expires_at) < now) return null;

  // Auto-extend session on active use (fire and forget)
  const newExpiry = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  Promise.resolve(supabase.from("sessions").update({ last_used_at: now.toISOString(), expires_at: newExpiry }).eq("id", sessionId)).catch(() => {});

  const user = Array.isArray(data.users) ? data.users[0] : data.users;

  return {
    id: data.id,
    user_id: data.user_id,
    discord_access_token: data.discord_access_token,
    expires_at: data.expires_at,
    revoked: data.revoked,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("sessions").update({ revoked: true }).eq("id", sessionId);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("sessions").update({ revoked: true }).eq("user_id", userId);
}

export async function cleanExpiredSessions(): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("sessions")
    .update({ revoked: true })
    .lt("expires_at", new Date().toISOString())
    .eq("revoked", false);
}
