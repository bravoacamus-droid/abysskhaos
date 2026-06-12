/**
 * Elemental advantage matrix + affinity bonuses (docs/CANON.md §9).
 *
 * Two cycles + a special. Multipliers: 1.5× advantage, 0.6× resistance, and the
 * single super-effective 2.0× (Light → Shadow). Cross-family pairs are neutral.
 *   Natural (Wu Xing): wood ▸ earth ▸ water ▸ fire ▸ metal ▸ (wood)
 *   Mystic:            wind ▸ lightning ▸ shadow ▸ light ▸ (wind)   + Light ×2 vs Shadow
 *
 * Element ids are the canonical English ids used in the `elements` table.
 * Unknown / null / legacy (`arcane`) elements resolve to neutral 1.0×, so
 * elementless mobs and retired elements never break combat.
 *
 * Affinity (Doc 1, Nv 1): a character deals +25% with its own element and
 * takes −25% from attacks of that same element.
 */

const RESIST = 0.6;

/** ADVANTAGE[attacker][defender] = multiplier when attacker is strong. */
const ADVANTAGE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  wood: { earth: 1.5 },
  earth: { water: 1.5 },
  water: { fire: 1.5 },
  fire: { metal: 1.5 },
  metal: { wood: 1.5 },
  wind: { lightning: 1.5 },
  lightning: { shadow: 1.5 },
  shadow: { light: 1.5 },
  light: { wind: 1.5, shadow: 2.0 },
};

export const AFFINITY_OUTGOING = 1.25; // +25% dealing with your own element
export const AFFINITY_RESIST = 0.75; // −25% taken from your own element

/**
 * Damage multiplier for an attack of `attacker` element hitting a `defender`
 * element. Returns 1.0 for any unknown/null/neutral matchup.
 */
export function elementMultiplier(attacker: string | null | undefined, defender: string | null | undefined): number {
  if (!attacker || !defender) return 1;
  const adv = ADVANTAGE[attacker]?.[defender];
  if (adv !== undefined) return adv;
  if (ADVANTAGE[defender]?.[attacker] !== undefined) return RESIST;
  return 1;
}

/**
 * Full elemental factor for a hit, folding the matrix and the attacker/defender
 * affinities. `attackerAffinity` is the element the attacker is attuned to
 * (gets +25% when its attack matches it); `defenderAffinity` is the defender's
 * attunement (−25% when the incoming element matches it).
 */
export function elementalDamageFactor(args: {
  attackElement: string | null | undefined;
  defenderElement: string | null | undefined;
  attackerAffinity?: string | null;
  defenderAffinity?: string | null;
}): number {
  let f = elementMultiplier(args.attackElement, args.defenderElement);
  if (args.attackElement && args.attackerAffinity && args.attackElement === args.attackerAffinity) {
    f *= AFFINITY_OUTGOING;
  }
  if (args.attackElement && args.defenderAffinity && args.attackElement === args.defenderAffinity) {
    f *= AFFINITY_RESIST;
  }
  return f;
}
