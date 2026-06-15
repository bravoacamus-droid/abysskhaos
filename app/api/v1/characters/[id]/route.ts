import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/v1/characters/:id — permanently delete a character.
 *
 * Owner-only: gated on users.is_owner so only the game owner's account can
 * tear down characters (the unlimited-characters convenience for testing —
 * see migration 20260615000001). Normal players cannot delete; their
 * entitlement is a single fixed character.
 *
 * Hard delete: every table referencing characters does so with
 * `on delete cascade` (character_items, rooms, combat_sessions, visits,
 * encounters, ground items), so removing the row cleans up the whole
 * character footprint. Ownership is verified server-side — a user can only
 * delete their own character.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const supabase = getSupabaseAdmin();

  const { data: owner, error: ownerErr } = await supabase
    .from("users")
    .select("is_owner")
    .eq("id", session.user.id)
    .maybeSingle();
  if (ownerErr) {
    return NextResponse.json({ error: "DB_FAILED", detail: ownerErr.message }, { status: 500 });
  }
  if (!owner?.is_owner) {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }

  // Verify the character exists and belongs to this user before deleting.
  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();
  if (charErr) {
    return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  }
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { error: delErr } = await supabase.from("characters").delete().eq("id", params.id);
  if (delErr) {
    return NextResponse.json({ error: "DELETE_FAILED", detail: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true, id: params.id } });
}
