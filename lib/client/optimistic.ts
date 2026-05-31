/**
 * Optimistic state helpers for equip / unequip.
 *
 * Strategy: mirror exactly what the server will do (move the item,
 * bounce the displaced occupant to the first free inventory slot,
 * adjust atk/def) so the UI reflects the post-equip state with zero
 * round-trip latency. The server response remains the source of
 * truth — when it arrives, we replace state with it; if it errors,
 * we roll back to the pre-equip snapshot.
 *
 * This is a UI smoothing pattern, NOT a security boundary. The
 * server validates ownership, slot compatibility, swaps, AND
 * recomputes combat stats from the DB (see
 * lib/server/stats.ts). Anything the client predicts wrong gets
 * corrected on the next render — and a tampered client gains no
 * gameplay advantage because the server always wins the next
 * combat-affecting interaction.
 */
import type { CharacterItem, EquippedSlot, RoomState } from "./api";

const TOTAL_INVENTORY_SLOTS = 40;

/** Find the lowest-index free inventory slot. Mirrors the bounce
 *  algorithm in app/api/v1/characters/[id]/equip/route.ts. */
function firstFreeInventorySlot(inventory: CharacterItem[]): number {
  const occupied = new Set(
    inventory.map((i) => i.slot).filter((s): s is number => typeof s === "number"),
  );
  for (let i = 0; i < TOTAL_INVENTORY_SLOTS; i++) {
    if (!occupied.has(i)) return i;
  }
  return -1;
}

/** Look up the weapon ATK + armor DEF bonus an item gives. */
function bonusesFor(state: RoomState, itemId: string): { atk: number; def: number } {
  const cat = state.item_catalog[itemId];
  return {
    atk: cat?.weapon?.base_atk ?? 0,
    def: cat?.armor?.base_def ?? 0,
  };
}

/**
 * Predicts the server's new RoomState after equipping `characterItemId`
 * into `slot`. Returns null if we can't predict cleanly (item not found,
 * inventory full on swap, etc.) — caller should skip the optimistic
 * update and wait for the server response.
 */
export function optimisticEquip(
  state: RoomState,
  characterItemId: string,
  slot: EquippedSlot,
): RoomState | null {
  // Find the item being equipped — could be in inventory or already
  // equipped in a different slot (e.g. moving sword main_hand → off_hand).
  const fromInv = state.inventory.find((i) => i.id === characterItemId);
  const fromEq = state.equipped.find((i) => i.id === characterItemId);
  const moving = fromInv ?? fromEq;
  if (!moving) return null;

  const displaced = state.equipped.find((i) => i.slot === slot && i.id !== characterItemId);

  // If the target slot has an occupant, it bounces to the first free
  // inventory cell. If inventory is full, the server returns 409 — bail
  // out and let the real call surface the error.
  let bouncedTo: number | null = null;
  if (displaced) {
    const inventoryWithoutMoving =
      fromInv != null
        ? state.inventory.filter((i) => i.id !== characterItemId)
        : state.inventory;
    bouncedTo = firstFreeInventorySlot(inventoryWithoutMoving);
    if (bouncedTo === -1) return null;
  }

  const movingBonuses = bonusesFor(state, moving.item_id);
  const displacedBonuses = displaced ? bonusesFor(state, displaced.item_id) : { atk: 0, def: 0 };

  const newInventory: CharacterItem[] = state.inventory
    .filter((i) => i.id !== characterItemId)
    .concat(
      displaced && bouncedTo !== null
        ? [{ ...displaced, slot: bouncedTo }]
        : [],
    );

  const newEquipped: CharacterItem[] = state.equipped
    .filter((i) => i.id !== characterItemId && i.id !== displaced?.id)
    .concat([{ ...moving, slot }]);

  return {
    ...state,
    inventory: newInventory,
    equipped: newEquipped,
    player: {
      ...state.player,
      atk: state.player.atk + movingBonuses.atk - displacedBonuses.atk,
      def: state.player.def + movingBonuses.def - displacedBonuses.def,
    },
  };
}

/**
 * Predicts the server's new RoomState after unequipping
 * `characterItemId` (moves it from equipped → first free inventory
 * cell). Returns null if inventory is full.
 */
export function optimisticUnequip(
  state: RoomState,
  characterItemId: string,
): RoomState | null {
  const eq = state.equipped.find((i) => i.id === characterItemId);
  if (!eq) return null;

  const free = firstFreeInventorySlot(state.inventory);
  if (free === -1) return null;

  const bonuses = bonusesFor(state, eq.item_id);

  return {
    ...state,
    equipped: state.equipped.filter((i) => i.id !== characterItemId),
    inventory: [...state.inventory, { ...eq, slot: free }],
    player: {
      ...state.player,
      atk: state.player.atk - bonuses.atk,
      def: state.player.def - bonuses.def,
    },
  };
}
