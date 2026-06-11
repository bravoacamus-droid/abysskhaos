/**
 * Class definitions for the Destiny Engine: primary attribute pair (drives the
 * weighted class roll) + initial weapon pool (the uniform weapon roll). The
 * pairs mirror `data/seeds/classes.ts` (Warrior = STR+STR per CANON). Weapon
 * pools are the narrowed *initial* sets from docs/DESTINY_ENGINE.md §1 — the
 * full favorable lists unlock in evolved classes.
 */

import type { AttrKey, ClassId, WeaponLoadoutId } from "./types";

export type DestinyClass = {
  id: ClassId;
  primaryA: AttrKey;
  primaryB: AttrKey;
  weaponPool: readonly WeaponLoadoutId[];
};

export const DESTINY_CLASSES: readonly DestinyClass[] = [
  { id: "warrior", primaryA: "strength", primaryB: "strength", weaponPool: ["sword_1h_shield", "axe_1h_shield", "sword_2h", "axe_2h"] },
  { id: "swordsman", primaryA: "strength", primaryB: "agility", weaponPool: ["sword_1h", "sword_2h"] },
  { id: "assassin", primaryA: "agility", primaryB: "intelligence", weaponPool: ["daggers", "dual_swords"] },
  { id: "infiltrator", primaryA: "agility", primaryB: "intelligence", weaponPool: ["pistol", "bow", "short_dagger"] },
  { id: "mage", primaryA: "intelligence", primaryB: "spirit", weaponPool: ["grimoire", "staff"] },
] as const;

export const DESTINY_CLASS_BY_ID: Readonly<Record<ClassId, DestinyClass>> = Object.fromEntries(
  DESTINY_CLASSES.map((c) => [c.id, c]),
) as Record<ClassId, DestinyClass>;

export const ALL_CLASS_IDS: readonly ClassId[] = DESTINY_CLASSES.map((c) => c.id);
