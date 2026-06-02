import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, fetchUser, fetchGuilds } from "@/lib/discord/oauth";
import { createSession, logAuthEvent } from "@/lib/auth";

const AUTO_JOIN_GUILD = "1511041364996132906";
const DISCORD_API = "https://discord.com/api/v10";

async function autoJoinGuild(userId: string, accessToken: string): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`${DISCORD_API}/guilds/${AUTO_JOIN_GUILD}/members/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch {
    // Silently fail - user may already be in the guild
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=missing_params", req.url));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("discord_oauth_state")?.value;

  if (!savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/?error=state_mismatch", req.url));
  }

  cookieStore.delete("discord_oauth_state");

  const tokenData = await exchangeCode(code);
  if (!tokenData) {
    return NextResponse.redirect(new URL("/?error=token_exchange_failed", req.url));
  }

  const user = await fetchUser(tokenData.access_token);
  if (!user) {
    return NextResponse.redirect(new URL("/?error=fetch_user_failed", req.url));
  }

  const guilds = await fetchGuilds(tokenData.access_token);
  if (!guilds) {
    return NextResponse.redirect(new URL("/?error=fetch_guilds_failed", req.url));
  }

  const supabase = createAdminClient();

  const { error: upsertError } = await supabase.from("users").upsert(
    { id: user.id, username: user.username, avatar: user.avatar },
    { onConflict: "id" }
  );

  if (upsertError) {
    console.error("Failed to upsert user:", upsertError);
  }

  const response = NextResponse.redirect(new URL("/dashboard", req.url));

  const joinedBefore = cookieStore.get("discord_joined")?.value;
  if (!joinedBefore) {
    await autoJoinGuild(user.id, tokenData.access_token);
    response.cookies.set("discord_joined", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365 * 5,
      path: "/",
    });
  }

  // Create server-side session
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const sessionId = await createSession(user.id, tokenData.access_token, ip);
    response.cookies.set("session_id", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    await logAuthEvent("login_success", user.id, ip, { username: user.username });
  } catch (err) {
    console.error("Failed to create session:", err);
    return NextResponse.redirect(new URL("/?error=session_failed", req.url));
  }

  return response;
}
