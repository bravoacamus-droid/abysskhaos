import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/dev-reset-tutorial
 *
 * DEV ONLY — wipes everything created during the tutorial so the
 * sequence can be retested from scratch on every app open. The client
 * calls this on mount while the TUTORIAL_DEV_RESET flag is on; we'll
 * remove both sides once the tutorial flow is locked in.
 *
 * Wipes for the calling character:
 *   - tutorial_step = 'walk_to_cedric'
 *   - delete all character_items
 *   - delete all room_ground_items visible to this character
 *   - delete the cedric_the_broken row from character_npc_meets so the
 *     first-dialogue gate re-fires
 */

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(_req);
  if (!session.ok) return session.response;

  const supabase = getSupabaseAdmin();

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Run the wipes in parallel — they're independent.
  const [r1, r2, r3, r4] = await Promise.all([
    supabase
      .from("characters")
      .update({ tutorial_step: "walk_to_cedric" })
      .eq("id", character.id),
    supabase.from("character_items").delete().eq("character_id", character.id),
    supabase
      .from("room_ground_items")
      .delete()
      .eq("visible_to_character_id", character.id),
    supabase
      .from("character_npc_meets")
      .delete()
      .eq("character_id", character.id)
      .eq("npc_id", "cedric_the_broken"),
  ]);
  for (const r of [r1, r2, r3, r4]) {
    if (r.error) {
      return NextResponse.json({ error: "DB_FAILED", detail: r.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: { ok: true } });
}
