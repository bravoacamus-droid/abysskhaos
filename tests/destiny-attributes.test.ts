/**
 * Destiny Engine — attribute roll stays within per-class ranges and preserves
 * class identity (primary attrs roll higher than non-primary on average).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CLASS_ATTRIBUTE_RANGES, DESTINY_CLASS_IDS, type AttrKey } from "../data/destiny/attribute-ranges";
import { rollAttributes } from "../lib/server/destiny/attributes";
import { mulberry32 } from "../lib/server/destiny/rng";

const COL: Record<AttrKey, keyof ReturnType<typeof rollAttributes>> = {
  strength: "attr_strength",
  agility: "attr_agility",
  intelligence: "attr_intelligence",
  spirit: "attr_spirit",
};
const ATTR_KEYS: AttrKey[] = ["strength", "agility", "intelligence", "spirit"];

test("every roll stays within the declared class ranges", () => {
  const rng = mulberry32(12345);
  for (const classId of DESTINY_CLASS_IDS) {
    const ranges = CLASS_ATTRIBUTE_RANGES[classId]!;
    for (let i = 0; i < 2000; i++) {
      const rolled = rollAttributes(classId, rng);
      for (const key of ATTR_KEYS) {
        const [min, max] = ranges[key];
        const v = rolled[COL[key]];
        assert.ok(v >= min && v <= max, `${classId}.${key}=${v} outside [${min},${max}]`);
      }
    }
  }
});

test("primary attributes average higher than non-primary (class identity holds)", () => {
  const rng = mulberry32(999);
  const N = 5000;
  for (const classId of DESTINY_CLASS_IDS) {
    const ranges = CLASS_ATTRIBUTE_RANGES[classId]!;
    const sums: Record<AttrKey, number> = { strength: 0, agility: 0, intelligence: 0, spirit: 0 };
    for (let i = 0; i < N; i++) {
      const rolled = rollAttributes(classId, rng);
      for (const key of ATTR_KEYS) sums[key] += rolled[COL[key]];
    }
    // A "primary" attr is any whose range ceiling is above the non-primary cap (6).
    const primaries = ATTR_KEYS.filter((k) => ranges[k][1] > 6);
    const nonPrimaries = ATTR_KEYS.filter((k) => ranges[k][1] <= 6);
    const avg = (k: AttrKey) => sums[k] / N;
    const minPrimaryAvg = Math.min(...primaries.map(avg));
    const maxNonPrimaryAvg = Math.max(...nonPrimaries.map(avg));
    assert.ok(
      minPrimaryAvg > maxNonPrimaryAvg,
      `${classId}: primary avg ${minPrimaryAvg.toFixed(2)} not > non-primary avg ${maxNonPrimaryAvg.toFixed(2)}`,
    );
  }
});

test("warrior STR uses the double-primary range [8,10]", () => {
  assert.deepEqual(CLASS_ATTRIBUTE_RANGES.warrior!.strength, [8, 10]);
});

test("rollAttributes throws on unknown class", () => {
  assert.throws(() => rollAttributes("paladin", mulberry32(1)), /unknown class/);
});
