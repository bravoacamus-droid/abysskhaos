/**
 * Element rarity weights for the independent element roll
 * (docs/DESTINY_ENGINE.md §7, canonized in docs/CANON.md §9).
 *
 * Integer weights chosen so the ratios are exact: total 600 →
 * Metal 12/600 = 2% · Oscuridad 30/600 = 5% · Luz 48/600 = 8% ·
 * each common 85/600 = 14.1667%.
 */

import type { ElementId } from "./types";

export type ElementWeight = { id: ElementId; weight: number };

// Ids are the canonical English `elements.id` (display names in CANON §9:
// shadow=Oscuridad, light=Luz, wind=Aire, lightning=Trueno).
export const ELEMENT_WEIGHTS: readonly ElementWeight[] = [
  { id: "metal", weight: 12 }, // 2%
  { id: "shadow", weight: 30 }, // 5% (Oscuridad)
  { id: "light", weight: 48 }, // 8% (Luz)
  { id: "fire", weight: 85 },
  { id: "water", weight: 85 },
  { id: "wood", weight: 85 }, // Madera
  { id: "earth", weight: 85 },
  { id: "wind", weight: 85 }, // Aire
  { id: "lightning", weight: 85 }, // Trueno
] as const;
