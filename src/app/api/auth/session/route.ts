import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, getSession, revokeSession, logAuthEvent } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { user, sessionId } = await verifyRequest(req);
    const session = await getSession(sessionId);
    return NextResponse.json({
      user: { id: user.id, username: user.username, avatar: user.avatar },
      session_id: sessionId,
      expires_at: session?.expires_at || null,
    });
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, sessionId } = await verifyRequest(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await revokeSession(sessionId);
    await logAuthEvent("logout", user.id, ip);

    const response = NextResponse.json({ ok: true });
    response.cookies.set("session_id", "", { maxAge: 0, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}
