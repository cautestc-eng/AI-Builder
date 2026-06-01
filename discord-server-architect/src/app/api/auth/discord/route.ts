import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOAuthURL } from "@/lib/discord/oauth";

export async function GET(req: NextRequest) {
  const state = crypto.randomUUID();

  const cookieStore = await cookies();
  cookieStore.set("discord_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  const url = getOAuthURL(state);
  return NextResponse.redirect(url);
}
