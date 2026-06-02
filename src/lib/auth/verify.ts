import { NextRequest } from "next/server";
import { getSession, revokeSession } from "./session";
import { logAuthEvent } from "./log";

export interface TrustedUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface VerifiedRequest {
  user: TrustedUser;
  discordAccessToken: string;
  sessionId: string;
}

const STRIPPED_FIELDS = new Set(["user_id", "author_id", "discord_id", "username"]);

export function stripIdentityFields(body: unknown): unknown {
  if (Array.isArray(body)) {
    return body.map(stripIdentityFields);
  }
  if (body && typeof body === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (STRIPPED_FIELDS.has(key)) continue;
      cleaned[key] = stripIdentityFields(value);
    }
    return cleaned;
  }
  return body;
}

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function verifyRequest(req: NextRequest): Promise<VerifiedRequest> {
  const ip = getIp(req);

  // 1. Extract session token: Authorization header > cookie
  let sessionId: string | null = null;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    sessionId = authHeader.slice(7);
  }

  if (!sessionId) {
    sessionId = req.cookies.get("session_id")?.value || null;
  }

  if (!sessionId) {
    await logAuthEvent("invalid_session", undefined, ip, { reason: "No session token provided" });
    throw new AuthError("Not authenticated", 401);
  }

  // 2. Resolve session
  const session = await getSession(sessionId);
  if (!session) {
    await logAuthEvent("invalid_session", undefined, ip, { reason: "Session not found, revoked, or expired", session_id: sessionId });
    throw new AuthError("Session expired or invalid", 401);
  }

  // 3. Check for spoofing: reject if client sent any identity fields
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    try {
      const body = await req.clone().json();
      for (const field of STRIPPED_FIELDS) {
        if (field in body) {
          // Spoofing attempt - revoke session and log
          await revokeSession(sessionId);
          await logAuthEvent("identity_spoofing_attempt", session.user_id, ip, {
            reason: `Client provided forbidden field '${field}'`,
            session_id: sessionId,
            value: body[field],
          });
          throw new AuthError("Security violation: identity fields are not allowed", 403);
        }
      }
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }

  // 4. Return verified identity
  return {
    user: session.user,
    discordAccessToken: session.discord_access_token,
    sessionId: session.id,
  };
}
