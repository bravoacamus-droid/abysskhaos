/**
 * Chinese zodiac → attribute tendency (docs/DESTINY_ENGINE.md §2).
 *
 * VIT folded into STR (CANON): Buey/Perro were VIT+2,STR+1 → STR+3; Cerdo was
 * VIT+2,SPI+1 → STR+2,SPI+1.
 *
 * Year→animal uses the Gregorian year (animal = (year − 4) mod 12). We do NOT
 * apply the lunar-new-year cutoff (late Jan/Feb), so a birthday in the first
 * weeks of a year maps to that Gregorian year's animal — acceptable precision
 * for a game roll.
 */

import type { Tendency } from "./types";

export type ZodiacSign = {
  id: string;
  tendency: Tendency;
};

/** Order is canonical: index 0 = Rata for years where (year − 4) % 12 === 0. */
export const ZODIAC: readonly ZodiacSign[] = [
  { id: "rata", tendency: { intelligence: 2, agility: 1 } },
  { id: "buey", tendency: { strength: 3 } },
  { id: "tigre", tendency: { strength: 2, agility: 1 } },
  { id: "conejo", tendency: { agility: 2, spirit: 1 } },
  { id: "dragon", tendency: { strength: 2, intelligence: 1 } },
  { id: "serpiente", tendency: { intelligence: 2, spirit: 1 } },
  { id: "caballo", tendency: { agility: 2, strength: 1 } },
  { id: "cabra", tendency: { spirit: 2, intelligence: 1 } },
  { id: "mono", tendency: { agility: 2, intelligence: 1 } },
  { id: "gallo", tendency: { intelligence: 2, agility: 1 } },
  { id: "perro", tendency: { strength: 3 } },
  { id: "cerdo", tendency: { strength: 2, spirit: 1 } },
] as const;

/** Map a Gregorian year to its zodiac sign. */
export function zodiacForYear(year: number): ZodiacSign {
  const idx = ((((year - 4) % 12) + 12) % 12);
  return ZODIAC[idx]!;
}
