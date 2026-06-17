/**
 * Destiny Engine — the weighted rolls (docs/DESTINY_ENGINE.md).
 *
 * Pure functions: they take config + an injected RNG and return ids. No DB, no
 * Date.now(). The orchestrator (./index.ts) wires the questionnaire answers to
 * these and the endpoint persists the result. SECURITY: server-only; the client
 * never sees weights or supplies the seed (feedback_security_server_authoritative).
 */

import { ELEMENT_WEIGHTS } from "@/data/destiny/elements";
import { DESTINY_CLASS_BY_ID } from "@/data/destiny/classes";
import { ALL_PASSIVE_IDS } from "@/data/destiny/passives";
import { isDualCompanion } from "@/data/destiny/companion-elements";
import type {
  AttrKey,
  ClassId,
  CompanionId,
  ElementId,
  OccupationOption,
  PassiveId,
  Tendency,
  WeaponLoadoutId,
} from "@/data/destiny/types";

import { pickOne, weightedPick, type Rng } from "./rng";

const ATTR_KEYS: readonly AttrKey[] = ["strength", "agility", "intelligence", "spirit"];

/** Sum any number of sparse tendency vectors into a dense one. */
export function combineTendencies(...parts: Tendency[]): Record<AttrKey, number> {
  const out: Record<AttrKey, number> = { strength: 0, agility: 0, intelligence: 0, spirit: 0 };
  for (const part of parts) {
    for (const key of ATTR_KEYS) out[key] += part[key] ?? 0;
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const CLASS_ROLL_ORDER: readonly ClassId[] = ["warrior", "swordsman", "mage", "infiltrator", "assassin"];

/**
 * Class weights from the tendency + lean (docs/DESTINY_ENGINE.md §1). A base of
 * 1 per class keeps the total positive for neutral answers and nudges the
 * population toward uniform; the answers tilt the individual.
 */
export function classWeights(tendency: Record<AttrKey, number>, lean: number): Record<ClassId, number> {
  const { strength: STR, agility: AGI, intelligence: INT, spirit: SPI } = tendency;
  const g = STR + STR; // Warrior — STR+STR (VIT folded into STR, CANON)
  const e = STR + AGI; // Swordsman
  const m = INT + SPI; // Mage
  const ai = AGI + INT; // shared Asesino/Infiltrador bucket
  const L = clamp(lean, -1, 1);
  const BASE = 1;
  return {
    warrior: BASE + g,
    swordsman: BASE + e,
    mage: BASE + m,
    infiltrator: BASE + ai * (0.5 + 0.5 * L),
    assassin: BASE + ai * (0.5 - 0.5 * L),
  };
}

export function rollClass(tendency: Record<AttrKey, number>, lean: number, rng: Rng): ClassId {
  const w = classWeights(tendency, lean);
  return weightedPick(
    rng,
    CLASS_ROLL_ORDER,
    CLASS_ROLL_ORDER.map((id) => w[id]),
  );
}

export function rollElement(rng: Rng): ElementId {
  return weightedPick(
    rng,
    ELEMENT_WEIGHTS.map((e) => e.id),
    ELEMENT_WEIGHTS.map((e) => e.weight),
  );
}

/**
 * Companion: occupation proposes #1, hobby proposes #1; forced distinct (fall
 * back to the hobby's then the occupation's #2), then weighted pick between the
 * two. DUAL-element pets are rarer: a dual candidate weighs half a single one
 * (so single-vs-dual ≈ 2/3 vs 1/3). See data/destiny/companion-elements.ts.
 */
export function rollCompanion(occupation: OccupationOption, hobby: OccupationOption, rng: Rng): CompanionId {
  let a = occupation.companions[0];
  let b = hobby.companions[0];
  if (a === b) b = hobby.companions[1];
  if (a === b) a = occupation.companions[1];
  // Extremely defensive: if a class' tables ever collide on both, fall back to
  // the occupation's pair so we still return a valid id.
  if (a === b) {
    a = occupation.companions[0];
    b = occupation.companions[1];
  }
  const wa = isDualCompanion(a) ? 0.5 : 1;
  const wb = isDualCompanion(b) ? 0.5 : 1;
  return rng() < wa / (wa + wb) ? a : b;
}

export function rollWeapon(classId: ClassId, rng: Rng): WeaponLoadoutId {
  return pickOne(rng, DESTINY_CLASS_BY_ID[classId].weaponPool);
}

const PASSIVE_AFFINITY_BONUS = 3;

/**
 * Passive: base weight 1 per passive, +bonus for the occupation's and hobby's
 * affinity passive, then weighted pick (docs/DESTINY_ENGINE.md §9).
 */
export function rollPassive(occupation: OccupationOption, hobby: OccupationOption, rng: Rng): PassiveId {
  const weights = new Map<PassiveId, number>(ALL_PASSIVE_IDS.map((id) => [id, 1]));
  weights.set(occupation.passive, (weights.get(occupation.passive) ?? 1) + PASSIVE_AFFINITY_BONUS);
  weights.set(hobby.passive, (weights.get(hobby.passive) ?? 1) + PASSIVE_AFFINITY_BONUS);
  return weightedPick(rng, ALL_PASSIVE_IDS, ALL_PASSIVE_IDS.map((id) => weights.get(id)!));
}
