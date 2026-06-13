import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runDestiny, secureSeed, mulberry32 } from "@/lib/server/destiny";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters → list the authenticated user's active characters,
 * ordered by slot.
 *
 * POST /api/v1/characters → create a character from the 3-question destiny quiz
 * (docs/DESTINY_ENGINE.md). The client sends only its answers; the server rolls
 * class / element / companion / weapon / attributes / passive with its own seed
 * and persists the result. SECURITY: the roll is server-authoritative — the
 * client never picks the class or supplies the seed
 * (feedback_security_server_authoritative).
 *
 * The 3-slot ceiling is enforced by a Postgres trigger
 * (`enforce_character_slot_limit`). Isekai entitlement: free tier = slot 1;
 * slots 2 and 3 require USDT in Phase 12, so server-side we allow only slot 1
 * for now.
 */

const NAME_PATTERN = /^[\p{L}\p{N} _.\-']{1,24}$/u;
const ALLOWED_FREE_SLOTS = [1];

const CHARACTER_COLUMNS =
  "id, slot_index, name, class_id, level, exp, hp_current, hp_max, mp_current, mp_max, atk, def, " +
  "attr_strength, attr_agility, attr_intelligence, attr_spirit, " +
  "element_id, companion_id, passive_id, passive_rank, weapon_loadout_id, current_floor, created_at";

export async function GET(req: Request) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("characters")
    .select(CHARACTER_COLUMNS)
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
  birth_date?: unknown;
  occupation_id?: unknown;
  hobby_id?: unknown;
  locale?: unknown;
  slot_index?: unknown;
};

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

type RolledIds = {
  classId: string;
  elementId: string;
  companionId: string;
  passiveId: string;
  weaponLoadoutId: string;
  meta: { zodiacId: string; ageBandId: string };
};

/**
 * Localized "destiny reveal" for the creation response — catalog display names
 * for the rolled class / element / companion / passive (same localization
 * pattern as /api/v1/classes). One-time per creation, not a hot path.
 */
async function buildDestinyReveal(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  locale: string,
  d: RolledIds,
) {
  const [classRes, elemRes, compRes, passRes] = await Promise.all([
    supabase.from("classes").select("name").eq("id", d.classId).maybeSingle(),
    supabase.from("elements").select("name, orb_url").eq("id", d.elementId).maybeSingle(),
    supabase.from("companions").select("name").eq("id", d.companionId).maybeSingle(),
    supabase.from("passives").select("name, value_r1, sign").eq("id", d.passiveId).maybeSingle(),
  ]);
  const names = {
    class: (classRes.data?.name as string | undefined) ?? d.classId,
    element: (elemRes.data?.name as string | undefined) ?? d.elementId,
    companion: (compRes.data?.name as string | undefined) ?? d.companionId,
    passive: (passRes.data?.name as string | undefined) ?? d.passiveId,
  };
  if (locale !== "en") {
    const want: Array<[keyof typeof names, string, string]> = [
      ["class", "class", d.classId],
      ["element", "element", d.elementId],
      ["companion", "companion", d.companionId],
      ["passive", "passive", d.passiveId],
    ];
    const trs = await Promise.all(
      want.map(([, type, id]) =>
        supabase
          .from("translations")
          .select("value")
          .eq("entity_type", type)
          .eq("entity_id", id)
          .eq("locale", locale)
          .eq("field", "name")
          .maybeSingle(),
      ),
    );
    trs.forEach((tr, i) => {
      const v = tr.data?.value as string | undefined;
      if (v) names[want[i]![0]] = v;
    });
  }
  return {
    class_name: names.class,
    element_name: names.element,
    element_orb_url: (elemRes.data?.orb_url as string | null | undefined) ?? null,
    companion_name: names.companion,
    passive_name: names.passive,
    passive_value: Number((passRes.data?.value_r1 as number | undefined) ?? 0),
    passive_sign: ((passRes.data?.sign as string | undefined) ?? "+") as "+" | "-",
    weapon_loadout_id: d.weaponLoadoutId,
    zodiac_id: d.meta.zodiacId,
    age_band_id: d.meta.ageBandId,
  };
}

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
  if (!isNonEmptyString(body.birth_date) || !isNonEmptyString(body.occupation_id) || !isNonEmptyString(body.hobby_id)) {
    return NextResponse.json(
      { error: "INVALID_ANSWERS", detail: "birth_date, occupation_id and hobby_id are required" },
      { status: 400 },
    );
  }

  // --- Destiny roll (server-authoritative, server seed) ----------------------
  const seed = secureSeed();
  let destiny;
  try {
    destiny = runDestiny(
      { birthDate: body.birth_date, occupationId: body.occupation_id, hobbyId: body.hobby_id },
      new Date(),
      mulberry32(seed),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DESTINY_FAILED";
    if (msg === "UNDERAGE") return NextResponse.json({ error: "UNDERAGE", detail: "13+ only" }, { status: 422 });
    if (msg.startsWith("INVALID_")) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "DESTINY_FAILED", detail: msg }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  // Base vitals come from the rolled class (attrs come from the roll).
  const { data: cls, error: classErr } = await supabase
    .from("classes")
    .select("id, starting_hp, starting_mp, starting_atk, starting_def")
    .eq("id", destiny.classId)
    .maybeSingle();
  if (classErr) {
    return NextResponse.json({ error: "CLASS_LOOKUP_FAILED", detail: classErr.message }, { status: 500 });
  }
  if (!cls) {
    // The roll produced a class that isn't seeded — server/data bug, not user input.
    return NextResponse.json({ error: "ROLLED_CLASS_MISSING", detail: destiny.classId }, { status: 500 });
  }

  // --- Slot allocation: free tier only gets slot 1 ---------------------------
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

  const { data: created, error: insertErr } = await supabase
    .from("characters")
    .insert({
      user_id: session.user.id,
      slot_index: slot,
      name: body.name,
      class_id: destiny.classId,
      hp_current: cls.starting_hp,
      hp_max: cls.starting_hp,
      mp_current: cls.starting_mp,
      mp_max: cls.starting_mp,
      atk: cls.starting_atk,
      def: cls.starting_def,
      attr_strength: destiny.attributes.attr_strength,
      attr_agility: destiny.attributes.attr_agility,
      attr_intelligence: destiny.attributes.attr_intelligence,
      attr_spirit: destiny.attributes.attr_spirit,
      element_id: destiny.elementId,
      companion_id: destiny.companionId,
      passive_id: destiny.passiveId,
      passive_rank: destiny.passiveRank,
      weapon_loadout_id: destiny.weaponLoadoutId,
      destiny_meta: {
        occupation_id: body.occupation_id,
        hobby_id: body.hobby_id,
        zodiac_id: destiny.meta.zodiacId,
        age_band_id: destiny.meta.ageBandId,
        seed,
      },
      current_floor: 100,
    })
    .select(CHARACTER_COLUMNS)
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

  const locale = typeof body.locale === "string" ? body.locale : "en";
  const reveal = await buildDestinyReveal(supabase, locale, {
    classId: destiny.classId,
    elementId: destiny.elementId,
    companionId: destiny.companionId,
    passiveId: destiny.passiveId,
    weaponLoadoutId: destiny.weaponLoadoutId,
    meta: destiny.meta,
  });

  return NextResponse.json(
    { data: { ...(created as unknown as Record<string, unknown>), destiny: reveal } },
    { status: 201 },
  );
}
