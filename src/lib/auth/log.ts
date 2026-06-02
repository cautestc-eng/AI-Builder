import { createAdminClient } from "@/lib/supabase/admin";

export type AuthEventType =
  | "login_success"
  | "login_failure"
  | "logout"
  | "session_created"
  | "session_expired"
  | "session_revoked"
  | "token_validation_failure"
  | "identity_spoofing_attempt"
  | "invalid_session"
  | "unauthorized_access";

export async function logAuthEvent(
  eventType: AuthEventType,
  userId?: string,
  ipAddress?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient();
  try {
    await supabase.from("security_logs").insert({
      event_type: eventType,
      user_id: userId || null,
      ip_address: ipAddress || null,
      details: details || {},
    });
  } catch (err) {
    console.error("Failed to write security log:", err);
  }
}
