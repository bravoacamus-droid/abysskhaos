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
import type { CharacterItem, EquippedSlot, InteractReward, RoomState } from "./api";

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

type FullBonuses = {
  atk: number; def: number;
  bonus_str: number; bonus_agi: number; bonus_int: number; bonus_spi: number;
  bonus_hp: number; bonus_mp: number;
};

const NO_BONUSES: FullBonuses = {
  atk: 0, def: 0,
  bonus_str: 0, bonus_agi: 0, bonus_int: 0, bonus_spi: 0,
  bonus_hp: 0, bonus_mp: 0,
};

/** Look up the full bonus set an item contributes when equipped:
 *  weapon base_atk (or armor base_def) plus the attribute/vital
 *  bonuses (bonus_str / bonus_hp / etc.) from the catalog entry. */
function bonusesFor(state: RoomState, itemId: string): FullBonuses {
  const cat = state.item_catalog[itemId];
  if (!cat) return { ...NO_BONUSES };
  const out: FullBonuses = { ...NO_BONUSES };
  if (cat.weapon) {
    out.atk        = cat.weapon.base_atk;
    out.bonus_str  = cat.weapon.bonus_str;
    out.bonus_agi  = cat.weapon.bonus_agi;
    out.bonus_int  = cat.weapon.bonus_int;
    out.bonus_spi  = cat.weapon.bonus_spi;
    out.bonus_hp   = cat.weapon.bonus_hp;
    out.bonus_mp   = cat.weapon.bonus_mp;
  }
  if (cat.armor) {
    out.def        = cat.armor.base_def;
    out.bonus_str += cat.armor.bonus_str;
    out.bonus_agi += cat.armor.bonus_agi;
    out.bonus_int += cat.armor.bonus_int;
    out.bonus_spi += cat.armor.bonus_spi;
    out.bonus_hp  += cat.armor.bonus_hp;
    out.bonus_mp  += cat.armor.bonus_mp;
  }
  return out;
}

/** Apply (sign × delta) to every numeric field of a player snapshot. */
function applyBonusDelta(
  player: RoomState["player"],
  delta: FullBonuses,
  sign: 1 | -1,
): RoomState["player"] {
  const s = sign;
  return {
    ...player,
    atk: player.atk + s * delta.atk,
    def: player.def + s * delta.def,
    effective_attr_strength:     player.effective_attr_strength     + s * delta.bonus_str,
    effective_attr_agility:      player.effective_attr_agility      + s * delta.bonus_agi,
    effective_attr_intelligence: player.effective_attr_intelligence + s * delta.bonus_int,
    effective_attr_spirit:       player.effective_attr_spirit       + s * delta.bonus_spi,
    hp_max_effective: player.hp_max_effective + s * delta.bonus_hp,
    mp_max_effective: player.mp_max_effective + s * delta.bonus_mp,
    equipped_bonuses: {
      atk: player.equipped_bonuses.atk + s * delta.atk,
      def: player.equipped_bonuses.def + s * delta.def,
      bonus_str: player.equipped_bonuses.bonus_str + s * delta.bonus_str,
      bonus_agi: player.equipped_bonuses.bonus_agi + s * delta.bonus_agi,
      bonus_int: player.equipped_bonuses.bonus_int + s * delta.bonus_int,
      bonus_spi: player.equipped_bonuses.bonus_spi + s * delta.bonus_spi,
      bonus_hp: player.equipped_bonuses.bonus_hp + s * delta.bonus_hp,
      bonus_mp: player.equipped_bonuses.bonus_mp + s * delta.bonus_mp,
    },
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
  const displacedBonuses = displaced ? bonusesFor(state, displaced.item_id) : NO_BONUSES;

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

  // Subtract displaced bonuses (if any), then add moving bonuses.
  // Mirrors the server's recompute: gear-only deltas, never touches
  // base attrs on the character row.
  let nextPlayer = state.player;
  if (displaced) {
    nextPlayer = applyBonusDelta(nextPlayer, displacedBonuses, -1);
  }
  // If the moving item was already equipped (slot swap, e.g. main_hand
  // → off_hand) its bonuses are already in player.atk/etc. — don't
  // double-add. Only add when promoting from inventory.
  if (fromInv) {
    nextPlayer = applyBonusDelta(nextPlayer, movingBonuses, +1);
  }

  return {
    ...state,
    inventory: newInventory,
    equipped: newEquipped,
    player: nextPlayer,
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
    player: applyBonusDelta(state.player, bonuses, -1),
  };
}

/**
 * Predicts the server's new RoomState + reward after opening a chest
 * (or any prop with metadata.interact = { kind: 'loot', items: [...] }).
 *
 * Mirrors /api/v1/characters/:id/interact:
 *   - composite key `${room_id}:${prop_kind}:${x}:${y}` appended to
 *     player.opened_props (the scene reads this to swap the chest
 *     sprite to the opened variant + suppress the Z prompt).
 *   - listed items added to inventory: stack into the existing row
 *     for the same item_id if one is in inventory, else into the
 *     first free slot.
 *
 * Returns null if the prediction can't be made cleanly (prop missing,
 * not interactable, already opened, or inventory full).
 */
export function optimisticInteract(
  state: RoomState,
  propKind: string,
  tileX: number,
  tileY: number,
): { state: RoomState; reward: InteractReward } | null {
  const prop = state.props.find(
    (p) => p.kind === propKind && p.x === tileX && p.y === tileY,
  );
  if (!prop) return null;
  const interact = (prop.metadata as { interact?: unknown } | null)?.interact as
    | { kind?: string; items?: Array<{ item_id: string; quantity?: number }>; message_key?: string }
    | undefined;
  if (!interact || interact.kind !== "loot") return null;
  const items = interact.items ?? [];
  if (items.length === 0) return null;

  const propKey = `${state.room.id}:${propKind}:${tileX}:${tileY}`;
  if ((state.player.opened_props ?? []).includes(propKey)) return null;

  // Stack-or-place into inventory. Strict mirror of the pickup +
  // /interact server logic so the predicted slots line up with what
  // the server returns; mismatched slot numbers would jiggle the
  // inventory grid when the server response replaces state.
  let nextInventory: CharacterItem[] = state.inventory;
  for (const grant of items) {
    const qty = grant.quantity ?? 1;
    const existingIdx = nextInventory.findIndex(
      (i) => i.item_id === grant.item_id && typeof i.slot === "number",
    );
    if (existingIdx !== -1) {
      const existing = nextInventory[existingIdx];
      nextInventory = nextInventory.map((i, idx) =>
        idx === existingIdx ? { ...i, quantity: i.quantity + qty } : i,
      );
      void existing;
    } else {
      const free = firstFreeInventorySlot(nextInventory);
      if (free === -1) return null;
      // Temporary client id; the server's UUID lands when the real
      // RoomState arrives and replaces this row in setState.
      nextInventory = [
        ...nextInventory,
        {
          id: `optimistic-${propKey}-${grant.item_id}`,
          item_id: grant.item_id,
          slot: free,
          quantity: qty,
          durability: null,
          metadata: {},
        },
      ];
    }
  }

  return {
    state: {
      ...state,
      inventory: nextInventory,
      player: {
        ...state.player,
        opened_props: [...(state.player.opened_props ?? []), propKey],
      },
    },
    reward: {
      message_key: interact.message_key ?? "interact.reward_generic",
      items,
    },
  };
}
