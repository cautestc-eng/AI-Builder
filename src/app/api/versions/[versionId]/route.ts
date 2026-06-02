import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  let verified;
  try {
    verified = await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { versionId } = await params;
  const supabase = createAdminClient();

  const { data: version, error } = await supabase
    .from("server_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (error || !version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  return NextResponse.json({ version });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  let verified;
  try {
    verified = await verifyRequest(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { versionId } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("server_versions")
    .delete()
    .eq("id", versionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
