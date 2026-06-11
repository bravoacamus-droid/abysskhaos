/**
 * Per-class initial attribute ranges for the Destiny Engine.
 *
 * Attributes are rolled randomly within these inclusive integer ranges at
 * character creation (see docs/DESTINY_ENGINE.md §8). Ranges are centered on
 * the legacy fixed baseline (non-primary = 5, single-primary = 7, Warrior's
 * double-STR = 9) so the random roll preserves the documented power level and
 * only adds variance — every class still averages ~24 total attribute points.
 *
 * The 4 attributes are STR / AGI / INT / SPI (there is no VIT column; per
 * docs/CANON.md the Warrior folds VIT into STR — its two primary slots are
 * both `strength`, hence the higher double-primary range). Primary pairs come
 * from `data/seeds/classes.ts` (primary_attr_a_id / primary_attr_b_id).
 */

export type AttrKey = "strength" | "agility" | "intelligence" | "spirit";

/** Inclusive integer range [min, max]. */
export type AttrRange = readonly [min: number, max: number];

export type ClassAttrRanges = Readonly<Record<AttrKey, AttrRange>>;

const NON_PRIMARY: AttrRange = [4, 6];
const PRIMARY: AttrRange = [6, 8];
/** Warrior STR — both primary slots are `strength` (VIT folded in, CANON). */
const DOUBLE_PRIMARY: AttrRange = [8, 10];

/** Keyed by `classes.id`. */
export const CLASS_ATTRIBUTE_RANGES: Readonly<Record<string, ClassAttrRanges>> = {
  warrior: { strength: DOUBLE_PRIMARY, agility: NON_PRIMARY, intelligence: NON_PRIMARY, spirit: NON_PRIMARY },
  swordsman: { strength: PRIMARY, agility: PRIMARY, intelligence: NON_PRIMARY, spirit: NON_PRIMARY },
  assassin: { strength: NON_PRIMARY, agility: PRIMARY, intelligence: PRIMARY, spirit: NON_PRIMARY },
  infiltrator: { strength: NON_PRIMARY, agility: PRIMARY, intelligence: PRIMARY, spirit: NON_PRIMARY },
  mage: { strength: NON_PRIMARY, agility: NON_PRIMARY, intelligence: PRIMARY, spirit: PRIMARY },
} as const;

export const DESTINY_CLASS_IDS = Object.keys(CLASS_ATTRIBUTE_RANGES);
