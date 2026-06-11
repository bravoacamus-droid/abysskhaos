/**
 * Destiny Engine — initial attribute roll.
 *
 * Attributes are fully random within per-class ranges (docs/DESTINY_ENGINE.md
 * §8); they are NOT derived from the questionnaire. Returns the four
 * `characters.attr_*` columns ready to persist.
 */

import { CLASS_ATTRIBUTE_RANGES } from "@/data/destiny/attribute-ranges";

import { randInt, type Rng } from "./rng";

export type RolledAttributes = {
  attr_strength: number;
  attr_agility: number;
  attr_intelligence: number;
  attr_spirit: number;
};

/** Roll the four primary attributes for a class, within its ranges. */
export function rollAttributes(classId: string, rng: Rng): RolledAttributes {
  const ranges = CLASS_ATTRIBUTE_RANGES[classId];
  if (!ranges) throw new Error(`rollAttributes: unknown class '${classId}'`);
  return {
    attr_strength: randInt(rng, ranges.strength[0], ranges.strength[1]),
    attr_agility: randInt(rng, ranges.agility[0], ranges.agility[1]),
    attr_intelligence: randInt(rng, ranges.intelligence[0], ranges.intelligence[1]),
    attr_spirit: randInt(rng, ranges.spirit[0], ranges.spirit[1]),
  };
}
