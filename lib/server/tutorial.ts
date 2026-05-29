/**
 * Tutorial state machine — server-side advancement on key events.
 *
 * The tutorial_step column on characters drives input gating (which
 * directions the client allows) and content gating (when the sword
 * drops, when the inventory forces open, etc). Transitions happen
 * server-side so the client can't skip steps by spoofing requests.
 *
 * Flow:
 *   walk_to_cedric   -> player spawns, only southward movement allowed
 *                       (until adjacent to Cedric, which auto-triggers
 *                       his first dialogue)
 *   after_dialogue   -> intermediate state set right after the Cedric
 *                       dialogue endpoint marks him as met; the same
 *                       call atomically inserts the sword on the floor
 *                       and advances to pickup_sword. This state exists
 *                       only to keep the transition logic atomic.
 *   pickup_sword     -> sword sits at (6, 3) in r01; player must walk
 *                       to it and press Z. /pickup advances on success.
 *   equip_sword      -> sword in inventory; React forces the inventory
 *                       panel open and disables movement; /equip
 *                       (slot=main_hand) advances to complete.
 *   complete         -> free play. Subsequent logins skip all gating.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TutorialStep =
  | "walk_to_cedric"
  | "after_dialogue"
  | "pickup_sword"
  | "equip_sword"
  | "complete";

/** Where the starter sword lands when Cedric gives it.
 *  Player spawns at (6, 9) by the south arch and walks NORTH (up) to
 *  Cedric at (6, 5). After dialogue, sword drops at (6, 7) — south of
 *  the player (who's at 6, 6 facing north), so it appears "behind"
 *  them and they must turn around to pick it up. */
const TUTORIAL_SWORD_TILE = { x: 6, y: 7 };
const TUTORIAL_SWORD_ITEM_ID = "starter_iron_sword";
const CEDRIC_NPC_ID = "cedric_the_broken";

/**
 * Called from POST /dialogue/:npcId AFTER the npc-meet upsert.
 *
 * If this was Cedric's first dialogue AND the player is in
 * walk_to_cedric, atomically:
 *   - drop the sword in r01 (visible only to this character)
 *   - advance tutorial_step to pickup_sword
 *
 * Idempotent: if the sword is already on the floor (stale browser
 * retry) or the step is already past walk_to_cedric, we no-op.
 *
 * Returns the new step so the dialogue response can include it.
 */
export async function onDialogueCompleted(
  supabase: SupabaseClient,
  args: { characterId: string; npcId: string },
): Promise<TutorialStep | null> {
  if (args.npcId !== CEDRIC_NPC_ID) return null;

  const { data: character } = await supabase
    .from("characters")
    .select("id, current_room_id, tutorial_step")
    .eq("id", args.characterId)
    .single();
  if (!character) return null;
  if (character.tutorial_step !== "walk_to_cedric") {
    return character.tutorial_step as TutorialStep;
  }

  // Check no sword already exists for this player (idempotency).
  const { data: existing } = await supabase
    .from("room_ground_items")
    .select("id")
    .eq("room_id", character.current_room_id)
    .eq("item_id", TUTORIAL_SWORD_ITEM_ID)
    .eq("visible_to_character_id", character.id)
    .maybeSingle();
  if (!existing) {
    const { error: dropErr } = await supabase.from("room_ground_items").insert({
      room_id: character.current_room_id,
      position_x: TUTORIAL_SWORD_TILE.x,
      position_y: TUTORIAL_SWORD_TILE.y,
      item_id: TUTORIAL_SWORD_ITEM_ID,
      quantity: 1,
      visible_to_character_id: character.id,
    });
    if (dropErr) throw new Error(`drop sword: ${dropErr.message}`);
  }

  const { error: stepErr } = await supabase
    .from("characters")
    .update({ tutorial_step: "pickup_sword" })
    .eq("id", character.id)
    .eq("tutorial_step", "walk_to_cedric"); // CAS to prevent overwriting in race
  if (stepErr) throw new Error(`advance tutorial step: ${stepErr.message}`);

  return "pickup_sword";
}

/** Called from POST /pickup after the item is moved into the inventory. */
export async function onItemPickedUp(
  supabase: SupabaseClient,
  args: { characterId: string; itemId: string },
): Promise<TutorialStep | null> {
  if (args.itemId !== TUTORIAL_SWORD_ITEM_ID) return null;

  const { data: character } = await supabase
    .from("characters")
    .select("tutorial_step")
    .eq("id", args.characterId)
    .single();
  if (!character || character.tutorial_step !== "pickup_sword") {
    return (character?.tutorial_step as TutorialStep) ?? null;
  }

  const { error } = await supabase
    .from("characters")
    .update({ tutorial_step: "equip_sword" })
    .eq("id", args.characterId)
    .eq("tutorial_step", "pickup_sword");
  if (error) throw new Error(`advance tutorial step: ${error.message}`);
  return "equip_sword";
}

/** Called from POST /equip after the item is moved into an equipped slot. */
export async function onItemEquipped(
  supabase: SupabaseClient,
  args: { characterId: string; itemId: string; slot: string },
): Promise<TutorialStep | null> {
  if (args.itemId !== TUTORIAL_SWORD_ITEM_ID) return null;
  if (args.slot !== "main_hand") return null;

  const { data: character } = await supabase
    .from("characters")
    .select("tutorial_step")
    .eq("id", args.characterId)
    .single();
  if (!character || character.tutorial_step !== "equip_sword") {
    return (character?.tutorial_step as TutorialStep) ?? null;
  }

  const { error } = await supabase
    .from("characters")
    .update({ tutorial_step: "complete" })
    .eq("id", args.characterId)
    .eq("tutorial_step", "equip_sword");
  if (error) throw new Error(`advance tutorial step: ${error.message}`);
  return "complete";
}
