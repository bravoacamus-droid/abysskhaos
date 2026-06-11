/**
 * Shared types for the Destiny Engine config tables (docs/DESTINY_ENGINE.md).
 *
 * Attributes are the 4 game attributes STR / AGI / INT / SPI. The design doc
 * uses a 5th tendency axis (VIT); per docs/CANON.md the Warrior folds VIT into
 * STR, so all config here folds VIT contributions into `strength`.
 */

export type AttrKey = "strength" | "agility" | "intelligence" | "spirit";

/** Sparse tendency vector; missing keys are 0. */
export type Tendency = Partial<Record<AttrKey, number>>;

export type ClassId = "warrior" | "swordsman" | "assassin" | "infiltrator" | "mage";

/**
 * Canonical English element ids (match `elements.id` in the DB; repo convention
 * is English id + localized display). Spanish display per docs/CANON.md §9:
 * wind=Aire, lightning=Trueno, shadow=Oscuridad. `metal`/`wood` are the pivot
 * additions; `arcane` is retired.
 */
export type ElementId =
  | "metal"
  | "wood"
  | "water"
  | "fire"
  | "earth"
  | "wind"
  | "lightning"
  | "light"
  | "shadow";

export type PassiveId =
  | "golpe_certero"
  | "coraza_espiritual"
  | "reflejo_renacido"
  | "lazo_almas"
  | "fortuna_renacido"
  | "codicia_destino"
  | "forjador_innato"
  | "memoria_vidas"
  | "nucleo_elemental"
  | "hambre_vital"
  | "viajero_etereo"
  | "flujo_mana";

/** Pet-family slug (the 23 companion families). */
export type CompanionId = string;

/** Initial weapon-loadout slug rolled at creation (mapped to Doc 7A later). */
export type WeaponLoadoutId = string;

export type OccupationOption = {
  id: string;
  tendency: Tendency;
  /** −1 = melee/stealth (Asesino) … +1 = ranged/tech (Infiltrador). */
  lean: number;
  /** [primary, secondary] companion proposals. */
  companions: readonly [CompanionId, CompanionId];
  passive: PassiveId;
};

export type HobbyOption = OccupationOption;
