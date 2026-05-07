import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters → list the authenticated user's active characters,
 * ordered by slot.
 *
 * POST /api/v1/characters → create a new character in the lowest empty slot
 * (or the requested slot if it's free and the user has access to it).
 *
 * The 4-slot ceiling is enforced by a Postgres trigger
 * (`enforce_character_slot_limit`); slots 3 and 4 require USDT in Phase 12,
 * so server-side we cap at slots 1–2 for now.
 */

const NAME_PATTERN = /^[\p{L}\p{N} _.\-']{1,24}$/u;
const ALLOWED_FREE_SLOTS = [1, 2];

export async function GET(req: Request) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("characters")
    .select(
      "id, slot_index, name, class_id, level, exp, hp_current, hp_max, mp_current, mp_max, atk, def, attr_strength, attr_agility, attr_intelligence, attr_spirit, current_floor, created_at",
    )
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("slot_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "DB_QUERY_FAILED", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

type CreateBody = {
  name?: unknown;
  class_id?: unknown;
  slot_index?: unknown;
};

export async function POST(req: Request) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string" || !NAME_PATTERN.test(body.name)) {
    return NextResponse.json(
      { error: "INVALID_NAME", detail: "1-24 chars, letters/numbers/spaces/.-_'" },
      { status: 400 },
    );
  }
  if (typeof body.class_id !== "string" || body.class_id.length === 0) {
    return NextResponse.json({ error: "INVALID_CLASS" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: cls, error: classErr } = await supabase
    .from("classes")
    .select("id, starting_hp, starting_mp, starting_atk, starting_def, primary_attr_a_id, primary_attr_b_id")
    .eq("id", body.class_id)
    .maybeSingle();
  if (classErr) {
    return NextResponse.json({ error: "CLASS_LOOKUP_FAILED", detail: classErr.message }, { status: 500 });
  }
  if (!cls) {
    return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 400 });
  }

  // Slot allocation: pick the lowest free slot in [1, 2]. Phase 12 will allow
  // slots 3-4 once the player has paid USDT.
  const { data: existing, error: existingErr } = await supabase
    .from("characters")
    .select("slot_index")
    .eq("user_id", session.user.id)
    .eq("is_active", true);
  if (existingErr) {
    return NextResponse.json({ error: "SLOTS_LOOKUP_FAILED", detail: existingErr.message }, { status: 500 });
  }
  const usedSlots = new Set((existing ?? []).map((r) => r.slot_index));
  const desiredSlot = typeof body.slot_index === "number" ? body.slot_index : null;
  let slot: number | null = null;
  if (desiredSlot !== null) {
    if (!ALLOWED_FREE_SLOTS.includes(desiredSlot)) {
      return NextResponse.json({ error: "SLOT_NOT_UNLOCKED" }, { status: 402 });
    }
    if (usedSlots.has(desiredSlot)) {
      return NextResponse.json({ error: "SLOT_OCCUPIED" }, { status: 409 });
    }
    slot = desiredSlot;
  } else {
    for (const candidate of ALLOWED_FREE_SLOTS) {
      if (!usedSlots.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    if (slot === null) {
      return NextResponse.json({ error: "NO_FREE_SLOTS" }, { status: 409 });
    }
  }

  // Lv 1 attribute scores: each primary attr starts at 5, the class' two
  // affinity attributes get +2 each. Sub-attributes start unallocated.
  const baseAttrs = { attr_strength: 5, attr_agility: 5, attr_intelligence: 5, attr_spirit: 5 };
  const attrColumn = (id: string) =>
    id === "strength"
      ? "attr_strength"
      : id === "agility"
        ? "attr_agility"
        : id === "intelligence"
          ? "attr_intelligence"
          : "attr_spirit";
  const colA = attrColumn(cls.primary_attr_a_id);
  const colB = attrColumn(cls.primary_attr_b_id);
  const attrs: Record<string, number> = { ...baseAttrs };
  attrs[colA] = (attrs[colA] ?? 5) + 2;
  attrs[colB] = (attrs[colB] ?? 5) + 2;

  const { data: created, error: insertErr } = await supabase
    .from("characters")
    .insert({
      user_id: session.user.id,
      slot_index: slot,
      name: body.name,
      class_id: body.class_id,
      hp_current: cls.starting_hp,
      hp_max: cls.starting_hp,
      mp_current: cls.starting_mp,
      mp_max: cls.starting_mp,
      atk: cls.starting_atk,
      def: cls.starting_def,
      attr_strength: attrs.attr_strength,
      attr_agility: attrs.attr_agility,
      attr_intelligence: attrs.attr_intelligence,
      attr_spirit: attrs.attr_spirit,
      current_floor: 100,
    })
    .select(
      "id, slot_index, name, class_id, level, exp, hp_current, hp_max, mp_current, mp_max, atk, def, attr_strength, attr_agility, attr_intelligence, attr_spirit, current_floor, created_at",
    )
    .single();

  if (insertErr) {
    if (insertErr.message.includes("character_slot_limit_exceeded")) {
      return NextResponse.json({ error: "SLOT_LIMIT_EXCEEDED" }, { status: 409 });
    }
    if (insertErr.message.includes("characters_user_slot_unique")) {
      return NextResponse.json({ error: "SLOT_OCCUPIED" }, { status: 409 });
    }
    return NextResponse.json({ error: "INSERT_FAILED", detail: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
