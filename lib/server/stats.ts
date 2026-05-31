/**
 * Server-authoritative stat recomputation.
 *
 * SECURITY: every combat-relevant stat is read fresh from the DB on
 * each equip / unequip. The client never sends new stat values, only
 * intents. See feedback_security_server_authoritative for the full
 * stance.
 *
 * What we compute and persist on characters:
 *   atk  = class.starting_atk + Σ(equipped weapons.base_atk)
 *   def  = class.starting_def + Σ(equipped armor.base_def)
 *
 * What we compute LIVE per /room request (NOT persisted — see
 * lib/server/room-state.ts):
 *   effective_attr_*   = character.attr_* + Σ(equipped *.bonus_<attr>)
 *   hp_max_effective   = character.hp_max + Σ(equipped *.bonus_hp)
 *   mp_max_effective   = character.mp_max + Σ(equipped *.bonus_mp)
 *
 * The "base" attrs / hp_max / mp_max stay on the characters row so
 * level-ups can mutate them simply (attr_strength += 1 on level-up,
 * etc.) without having to subtract gear bonuses first. Equipped
 * bonuses are layered on top in the response.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EquippedBonuses = {
  atk: number;
  def: number;
  bonus_str: number;
  bonus_agi: number;
  bonus_int: number;
  bonus_spi: number;
  bonus_hp: number;
  bonus_mp: number;
};

const EMPTY_BONUSES: EquippedBonuses = {
  atk: 0, def: 0,
  bonus_str: 0, bonus_agi: 0, bonus_int: 0, bonus_spi: 0,
  bonus_hp: 0, bonus_mp: 0,
};

/** Sum up ATK / DEF / attribute / vital bonuses contributed by every
 *  item the character has equipped. Weapons feed base_atk + bonus_*,
 *  armor feeds base_def + bonus_*. Accessories aren't included yet —
 *  the accessories table uses its own bonus_attribute_id/bonus_value
 *  pattern and we'll fold it in once accessories ship with content. */
export async function computeEquippedBonuses(
  supabase: SupabaseClient,
  characterId: string,
): Promise<EquippedBonuses> {
  const { data: items, error } = await supabase
    .from("character_items")
    .select("item_id")
    .eq("character_id", characterId)
    .not("equipped_slot", "is", null);
  if (error) throw new Error(`load equipped items: ${error.message}`);
  const itemIds = (items ?? []).map((i) => i.item_id as string);
  if (itemIds.length === 0) return { ...EMPTY_BONUSES };

  const cols = "item_id, bonus_str, bonus_agi, bonus_int, bonus_spi, bonus_hp, bonus_mp";
  const [wRes, aRes] = await Promise.all([
    supabase.from("weapons").select(`${cols}, base_atk`).in("item_id", itemIds),
    supabase.from("armor").select(`${cols}, base_def`).in("item_id", itemIds),
  ]);
  if (wRes.error) throw new Error(`load weapons: ${wRes.error.message}`);
  if (aRes.error) throw new Error(`load armor: ${aRes.error.message}`);

  const total: EquippedBonuses = { ...EMPTY_BONUSES };
  for (const w of wRes.data ?? []) {
    total.atk       += (w.base_atk  as number) ?? 0;
    total.bonus_str += (w.bonus_str as number) ?? 0;
    total.bonus_agi += (w.bonus_agi as number) ?? 0;
    total.bonus_int += (w.bonus_int as number) ?? 0;
    total.bonus_spi += (w.bonus_spi as number) ?? 0;
    total.bonus_hp  += (w.bonus_hp  as number) ?? 0;
    total.bonus_mp  += (w.bonus_mp  as number) ?? 0;
  }
  for (const a of aRes.data ?? []) {
    total.def       += (a.base_def  as number) ?? 0;
    total.bonus_str += (a.bonus_str as number) ?? 0;
    total.bonus_agi += (a.bonus_agi as number) ?? 0;
    total.bonus_int += (a.bonus_int as number) ?? 0;
    total.bonus_spi += (a.bonus_spi as number) ?? 0;
    total.bonus_hp  += (a.bonus_hp  as number) ?? 0;
    total.bonus_mp  += (a.bonus_mp  as number) ?? 0;
  }
  return total;
}

/** Recompute and persist character.atk + character.def to reflect the
 *  current equipped set. attr_* and hp_max/mp_max are NOT persisted —
 *  they stay base and are layered live by the room-state builder. */
export async function recomputeAndPersistCombatStats(
  supabase: SupabaseClient,
  characterId: string,
): Promise<EquippedBonuses> {
  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("class_id")
    .eq("id", characterId)
    .single();
  if (chErr) throw new Error(`load character: ${chErr.message}`);
  const { data: klass, error: kErr } = await supabase
    .from("classes")
    .select("starting_atk, starting_def")
    .eq("id", ch.class_id)
    .single();
  if (kErr) throw new Error(`load class: ${kErr.message}`);

  const bonuses = await computeEquippedBonuses(supabase, characterId);
  const atk = (klass.starting_atk as number) + bonuses.atk;
  const def = (klass.starting_def as number) + bonuses.def;
  const { error: upErr } = await supabase
    .from("characters")
    .update({ atk, def })
    .eq("id", characterId);
  if (upErr) throw new Error(`persist stats: ${upErr.message}`);
  return { ...bonuses, atk, def };
}
