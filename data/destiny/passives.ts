/**
 * The 12 "pasivas del renacido" (docs/DESTINY_ENGINE.md §9). Each has 10 ranks;
 * the effect scales linearly from `r1` (rank 1) to `r10` (rank 10, cap at Nv10).
 * `effect` is the stat the passive moves; `unit` is "pct" unless noted.
 *
 * Which passive a character gets is rolled from the questionnaire (see
 * lib/server/destiny/rolls.ts → rollPassive), weighted by the occupation's and
 * hobby's passive affinity.
 */

import type { PassiveId } from "./types";

export type Passive = {
  id: PassiveId;
  effect: string;
  r1: number;
  r10: number;
  /** Display sign: most are "+", damage-reduction / MP-cost are "−". */
  sign: "+" | "-";
};

export const PASSIVES: readonly Passive[] = [
  { id: "golpe_certero", effect: "crit_chance", r1: 1, r10: 5, sign: "+" },
  { id: "coraza_espiritual", effect: "damage_taken", r1: 1, r10: 5, sign: "-" },
  { id: "reflejo_renacido", effect: "evasion", r1: 1, r10: 5, sign: "+" },
  { id: "lazo_almas", effect: "companion_effectiveness", r1: 2, r10: 15, sign: "+" },
  { id: "fortuna_renacido", effect: "khryn_gain", r1: 1, r10: 10, sign: "+" },
  { id: "codicia_destino", effect: "rarity_drop_chance", r1: 2, r10: 10, sign: "+" },
  { id: "forjador_innato", effect: "forge_capture_success", r1: 2, r10: 10, sign: "+" },
  { id: "memoria_vidas", effect: "xp_gain", r1: 3, r10: 10, sign: "+" },
  { id: "nucleo_elemental", effect: "elemental_damage", r1: 2, r10: 10, sign: "+" },
  { id: "hambre_vital", effect: "lifesteal", r1: 1, r10: 5, sign: "+" },
  { id: "viajero_etereo", effect: "flee_encounter", r1: 3, r10: 15, sign: "+" },
  { id: "flujo_mana", effect: "mp_cost", r1: 2, r10: 15, sign: "-" },
] as const;

export const ALL_PASSIVE_IDS: readonly PassiveId[] = PASSIVES.map((p) => p.id);

/** Value of a passive at a given rank (1..10), linear interpolation, rounded to 0.1. */
export function passiveValueAtRank(passive: Passive, rank: number): number {
  const r = Math.min(10, Math.max(1, Math.round(rank)));
  const v = passive.r1 + ((passive.r10 - passive.r1) * (r - 1)) / 9;
  return Math.round(v * 10) / 10;
}
