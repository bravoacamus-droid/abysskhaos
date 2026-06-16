import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DESTINY_CLASS_BY_ID, type DestinyClass } from "@/data/destiny/classes";
import type { ClassId } from "@/data/destiny/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATLAS_FACING = "south-west";

/** Build the per-weapon-family creation-PREVIEW frame sequence (south-west)
 *  out of a class's combat_animation_atlas. The picker plays this as one
 *  looping clip so the player sees the class's moves with each weapon:
 *    - normal classes:  skill → basic attack → defeat
 *    - mage (per the user): ALL 4 elemental skills → defeat  (no basic attack)
 *  The mage is detected by the presence of a `skill_fire_<family>` key. */
function extractCombatPreview(
  klass: DestinyClass | undefined,
  atlas: Record<string, Record<string, string[]>> | null,
): Record<string, string[]> {
  if (!klass || !atlas) return {};
  const out: Record<string, string[]> = {};
  for (const family of klass.weaponPool) {
    const frames = (state: string) => atlas[`${state}_${family}`]?.[ATLAS_FACING] ?? [];
    const isMage = frames("skill_fire").length > 0;
    const sequence = isMage
      ? ["skill_fire", "skill_thunder", "skill_ice", "skill_heal", "death"]
      : ["skill", "attack", "death"];
    const seq = sequence.flatMap(frames);
    if (seq.length > 0) out[family] = seq;
  }
  return out;
}

/**
 * Public read of the 5 base classes (with portraits) so the character
 * creation wizard can render the class cards. Translations for the requested
 * locale are inlined as `name_localized` / `description_localized` to save
 * the client a second round-trip.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

  const supabase = getSupabaseAdmin();
  const { data: classes, error } = await supabase
    .from("classes")
    .select(
      "id, name, description, primary_attr_a_id, primary_attr_b_id, starting_hp, starting_mp, starting_atk, starting_def, sort_order, portrait_url, combat_animation_atlas",
    )
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "DB_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  const classIds = (classes ?? []).map((c) => c.id);
  let translations: Map<string, Record<string, string>> = new Map();
  if (locale !== "en" && classIds.length > 0) {
    const { data: trans, error: tErr } = await supabase
      .from("translations")
      .select("entity_id, field, value")
      .eq("entity_type", "class")
      .eq("locale", locale)
      .in("entity_id", classIds);
    if (tErr) {
      return NextResponse.json({ error: "TRANSLATIONS_QUERY_FAILED", detail: tErr.message }, { status: 500 });
    }
    translations = new Map();
    for (const row of trans ?? []) {
      const entry = translations.get(row.entity_id) ?? {};
      entry[row.field as string] = row.value as string;
      translations.set(row.entity_id, entry);
    }
  }

  const data = (classes ?? []).map((c) => {
    const tr = translations.get(c.id) ?? {};
    const klass = DESTINY_CLASS_BY_ID[c.id as ClassId];
    const { combat_animation_atlas, ...rest } = c as typeof c & {
      combat_animation_atlas: Record<string, Record<string, string[]>> | null;
    };
    return {
      ...rest,
      name_localized: tr.name ?? c.name,
      description_localized: tr.description ?? c.description,
      // Player-chosen creation: the weapon pool + the attack animation frames
      // per weapon so the picker can show the animated character with each weapon.
      weapon_pool: klass ? [...klass.weaponPool] : [],
      combat_preview: extractCombatPreview(klass, combat_animation_atlas),
    };
  });

  return NextResponse.json({ data });
}
