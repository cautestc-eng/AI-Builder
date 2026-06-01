import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, fetchUser, fetchGuilds } from "@/lib/discord/oauth";

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

  response.cookies.set("discord_access_token", tokenData.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  response.cookies.set("discord_user_id", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  response.cookies.set("discord_username", user.username, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
