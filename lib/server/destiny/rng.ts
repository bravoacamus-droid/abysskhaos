/**
 * Deterministic, seedable PRNG for the Destiny Engine.
 *
 * SECURITY: every destiny roll (class, element, companion, weapon, attributes,
 * passive) runs server-side. The client never supplies the seed or the result
 * — it only sends the 3 quiz answers. Production seeds come from `secureSeed()`
 * (node:crypto); tests inject a fixed seed for reproducibility. See
 * feedback_security_server_authoritative.
 *
 * mulberry32: tiny, fast, good enough for non-cryptographic gameplay rolls.
 * The unpredictability that matters for fairness comes from the crypto seed,
 * not from the PRNG's statistical strength.
 */

import { randomInt } from "node:crypto";

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** mulberry32 — seed is coerced to a uint32. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh, crypto-strong seed for a single character creation. */
export function secureSeed(): number {
  return randomInt(0, 0x7fffffff);
}

/** Inclusive integer in [min, max]. */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error(`randInt: max ${max} < min ${min}`);
  return min + Math.floor(rng() * (max - min + 1));
}

/** Uniformly pick one element of a non-empty array. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pickOne: empty array");
  return items[randInt(rng, 0, items.length - 1)]!;
}

/**
 * Weighted pick: `weights[i]` is the relative weight of `items[i]`.
 * Throws if lengths differ or the total weight is not positive.
 */
export function weightedPick<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  if (items.length !== weights.length) throw new Error("weightedPick: length mismatch");
  let total = 0;
  for (const w of weights) {
    if (w < 0 || !Number.isFinite(w)) throw new Error(`weightedPick: bad weight ${w}`);
    total += w;
  }
  if (total <= 0) throw new Error("weightedPick: total weight must be > 0");
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return items[i]!;
  }
  return items[items.length - 1]!; // float-rounding fallback
}
