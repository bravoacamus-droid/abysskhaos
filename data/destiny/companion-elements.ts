/**
 * Element typing per companion (Destiny Engine, docs/DESTINY_ENGINE.md §6).
 *
 * A pet may be DUAL-element (`secondary` set). Dual pets:
 *   - wield BOTH elements offensively (a Young pet learns its 2nd elemental
 *     skill anim now; full kit by Adult stage),
 *   - inherit the WEAKNESSES of BOTH elements defensively (combat),
 *   - are rolled at HALF probability vs a single-element pet (rolls.ts).
 *
 * This is the single source of truth: the seed writes it to
 * `companions.element_primary/_secondary`, and the roll reads `DUAL_COMPANION_IDS`.
 */
import type { CompanionId, ElementId } from "./types";

export type CompanionElements = { primary: ElementId; secondary?: ElementId };

export const COMPANION_ELEMENTS: Record<string, CompanionElements> = {
  drake: { primary: "fire" },
  wisp: { primary: "light" },
  lion_cub: { primary: "fire" }, // baby sabertooth
  sprite: { primary: "wood" },
  crystal_familiar: { primary: "metal" },
  imp: { primary: "shadow" },
  owlet: { primary: "wind", secondary: "light" },
  wolf_pup: { primary: "water" }, // white dire wolf (icy water skill)
  slime: { primary: "water" },
  phoenix_chick: { primary: "fire" },
  mecha: { primary: "metal" },
  kitten_spirit: { primary: "shadow" }, // moon mark
  bat: { primary: "shadow" },
  falcon: { primary: "wind" },
  aerodactyl: { primary: "wind", secondary: "metal" },
  bear_cub: { primary: "earth" }, // sleepy panda
  fairy: { primary: "light" },
  serpent: { primary: "wood" }, // particular venom skills (TBD)
  demon: { primary: "shadow" },
  horse_angel: { primary: "light", secondary: "lightning" }, // masked celestial steed
  horse_dark: { primary: "fire", secondary: "shadow" }, // horned dark steed (dark fire)
  dinosaur: { primary: "lightning" }, // raptor — lightning-typed; thunder skill unlocks at Adult
  boar: { primary: "earth", secondary: "fire" }, // blue-fire boar (blue fire = particular skills, TBD)
};

/** Ids of the dual-element pets (rolled at half weight). */
export const DUAL_COMPANION_IDS: ReadonlySet<string> = new Set(
  Object.keys(COMPANION_ELEMENTS).filter((id) => COMPANION_ELEMENTS[id]!.secondary !== undefined),
);

export function isDualCompanion(id: CompanionId): boolean {
  return DUAL_COMPANION_IDS.has(id);
}

/** [primary] or [primary, secondary] — the elements a pet fights with / is weak to. */
export function companionElements(id: CompanionId): ElementId[] {
  const e = COMPANION_ELEMENTS[id];
  if (!e) return [];
  return e.secondary ? [e.primary, e.secondary] : [e.primary];
}
