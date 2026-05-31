import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/dev-reset-tutorial
 *
 * DEV ONLY — resets just the tutorial GATING state so the flow can
 * replay on every app open, but PRESERVES inventory + ground items
 * that the player already owns. The user explicitly asked: "el
 * tutorial siempre se realice de nuevo pero la espada debe ser
 * persistente en el inventario". Combined with the idempotency check
 * in onDialogueCompleted (skips drop + jumps to complete if the
 * sword is already owned), the replay does the walk + dialogue but
 * doesn't duplicate the sword on the floor.
 *
 * Wipes for the calling character:
 *   - tutorial_step = 'walk_to_cedric'
 *   - delete the cedric_the_broken row from character_npc_meets so the
 *     first-dialogue gate re-fires
 *
 * Preserves:
 *   - character_items (all owned weapons / armor / consumables)
 *   - room_ground_items (any loose drops the player hasn't picked up)
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

  const [r1, r2] = await Promise.all([
    supabase
      .from("characters")
      .update({ tutorial_step: "walk_to_cedric" })
      .eq("id", character.id),
    supabase
      .from("character_npc_meets")
      .delete()
      .eq("character_id", character.id)
      .eq("npc_id", "cedric_the_broken"),
  ]);
  for (const r of [r1, r2]) {
    if (r.error) {
      return NextResponse.json({ error: "DB_FAILED", detail: r.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: { ok: true } });
}
