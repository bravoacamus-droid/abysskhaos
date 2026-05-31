/**
 * Server-authoritative stat recomputation.
 *
 * SECURITY: combat stats (atk, def, hp, mp, etc.) are stored on the
 * characters table and ONLY the server is allowed to mutate them.
 * The client receives the computed values via /room hydration but
 * cannot edit them — any /equip or /unequip request triggers this
 * helper, which recomputes the totals from the character's BASE
 * stats (rows in classes.starting_*) PLUS the sum of bonuses from
 * every item currently in an equipped_slot. Item base stats also
 * come from the DB (weapons.base_atk, armor.base_def). Never trust
 * client-provided numbers for any of this.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EquippedBonuses = { atk: number; def: number };

/** Sum up the ATK + DEF bonuses from every item currently equipped
 *  by this character. Weapons contribute base_atk, armor contributes
 *  base_def. */
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
  if (itemIds.length === 0) return { atk: 0, def: 0 };

  const [wRes, aRes] = await Promise.all([
    supabase.from("weapons").select("item_id, base_atk").in("item_id", itemIds),
    supabase.from("armor").select("item_id, base_def").in("item_id", itemIds),
  ]);
  if (wRes.error) throw new Error(`load weapons: ${wRes.error.message}`);
  if (aRes.error) throw new Error(`load armor: ${aRes.error.message}`);

  let atk = 0;
  let def = 0;
  for (const w of wRes.data ?? []) atk += (w.base_atk as number) ?? 0;
  for (const a of aRes.data ?? []) def += (a.base_def as number) ?? 0;
  return { atk, def };
}

/** Recompute and persist character.atk + character.def to reflect the
 *  current equipped set. Returns the new totals. */
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
  return { atk, def };
}
