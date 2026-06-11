/**
 * Age band → attribute tendency (docs/DESTINY_ENGINE.md §3). Game is 13+.
 * VIT folded into STR: 35–49 was INT+1,VIT+1 → INT+1,STR+1; 65+ was
 * SPI+1,VIT+1 → SPI+1,STR+1.
 */

import type { Tendency } from "./types";

export type AgeBand = {
  id: string;
  /** Inclusive lower bound; `null` upper = open-ended. */
  minAge: number;
  maxAge: number | null;
  tendency: Tendency;
};

export const MIN_PLAYER_AGE = 13;

export const AGE_BANDS: readonly AgeBand[] = [
  { id: "13_17", minAge: 13, maxAge: 17, tendency: { agility: 1, strength: 1 } },
  { id: "18_24", minAge: 18, maxAge: 24, tendency: { agility: 1, intelligence: 1 } },
  { id: "25_34", minAge: 25, maxAge: 34, tendency: { strength: 1, intelligence: 1 } },
  { id: "35_49", minAge: 35, maxAge: 49, tendency: { intelligence: 1, strength: 1 } },
  { id: "50_64", minAge: 50, maxAge: 64, tendency: { intelligence: 1, spirit: 1 } },
  { id: "65_plus", minAge: 65, maxAge: null, tendency: { spirit: 1, strength: 1 } },
] as const;

/** Resolve the band for an age. Throws below the minimum play age. */
export function ageBandForAge(age: number): AgeBand {
  if (age < MIN_PLAYER_AGE) throw new Error(`ageBandForAge: age ${age} below minimum ${MIN_PLAYER_AGE}`);
  for (const band of AGE_BANDS) {
    if (age >= band.minAge && (band.maxAge === null || age <= band.maxAge)) return band;
  }
  return AGE_BANDS[AGE_BANDS.length - 1]!; // unreachable: last band is open-ended
}
