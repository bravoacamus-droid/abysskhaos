/**
 * Occupation options (docs/DESTINY_ENGINE.md §4) — general categories. Each
 * carries an attribute tendency (VIT folded into STR), a melee↔ranged lean L
 * for the Asesino/Infiltrador tiebreak, a 2-companion proposal, and a passive
 * affinity. The occupation proposes companion #1; the hobby proposes the other
 * (see rollCompanion).
 */

import type { OccupationOption } from "./types";

export const OCCUPATIONS: readonly OccupationOption[] = [
  { id: "estudiante", tendency: { intelligence: 1, agility: 1 }, lean: 0.3, companions: ["owlet", "kitten_spirit"], passive: "memoria_vidas" },
  { id: "comerciante", tendency: { agility: 1, intelligence: 1 }, lean: 0.2, companions: ["imp", "serpent"], passive: "fortuna_renacido" },
  { id: "empresario", tendency: { intelligence: 1, strength: 1 }, lean: 0.3, companions: ["drake", "lion_cub"], passive: "fortuna_renacido" },
  { id: "sin_ocupacion", tendency: {}, lean: 0, companions: ["slime", "demon"], passive: "viajero_etereo" },
  { id: "artista", tendency: { spirit: 1, intelligence: 1 }, lean: 0, companions: ["fairy", "sprite"], passive: "flujo_mana" },
  { id: "ingeniero", tendency: { intelligence: 1, strength: 1 }, lean: 0.6, companions: ["mecha", "crystal_familiar"], passive: "forjador_innato" },
  { id: "cientifico", tendency: { intelligence: 1, spirit: 1 }, lean: 0.5, companions: ["owlet", "wisp"], passive: "forjador_innato" },
  { id: "medico", tendency: { intelligence: 1, spirit: 1 }, lean: 0.1, companions: ["wisp", "horse_angel"], passive: "hambre_vital" },
  { id: "programador", tendency: { intelligence: 2 }, lean: 0.8, companions: ["mecha", "bat"], passive: "flujo_mana" },
  { id: "docente", tendency: { intelligence: 1, spirit: 1 }, lean: 0, companions: ["owlet", "sprite"], passive: "memoria_vidas" },
  { id: "militar", tendency: { strength: 2 }, lean: 0.4, companions: ["wolf_pup", "bear_cub"], passive: "coraza_espiritual" },
  { id: "atleta", tendency: { strength: 1, agility: 1 }, lean: -0.5, companions: ["lion_cub", "dinosaur"], passive: "golpe_certero" },
  { id: "obrero", tendency: { strength: 2 }, lean: -0.4, companions: ["boar", "bear_cub"], passive: "coraza_espiritual" },
  { id: "agricultor", tendency: { strength: 1, spirit: 1 }, lean: -0.3, companions: ["boar", "horse_dark"], passive: "codicia_destino" },
  { id: "abogado", tendency: { intelligence: 1, agility: 1 }, lean: 0.2, companions: ["serpent", "drake"], passive: "fortuna_renacido" },
  { id: "funcionario", tendency: { intelligence: 1, spirit: 1 }, lean: 0.2, companions: ["crystal_familiar", "slime"], passive: "flujo_mana" },
  { id: "chef", tendency: { agility: 1, strength: 1 }, lean: 0, companions: ["slime", "phoenix_chick"], passive: "hambre_vital" },
  { id: "musico", tendency: { spirit: 1, agility: 1 }, lean: 0, companions: ["fairy", "phoenix_chick"], passive: "lazo_almas" },
  { id: "escritor", tendency: { intelligence: 1, spirit: 1 }, lean: 0, companions: ["owlet", "bat"], passive: "memoria_vidas" },
  { id: "disenador", tendency: { intelligence: 1, agility: 1 }, lean: 0.2, companions: ["kitten_spirit", "fairy"], passive: "flujo_mana" },
  { id: "conductor", tendency: { strength: 1, agility: 1 }, lean: 0.2, companions: ["horse_dark", "aerodactyl"], passive: "viajero_etereo" },
  { id: "religioso", tendency: { spirit: 1, strength: 1 }, lean: 0, companions: ["horse_angel", "wisp"], passive: "nucleo_elemental" },
  { id: "aventurero", tendency: { strength: 1, agility: 1 }, lean: 0, companions: ["aerodactyl", "demon"], passive: "viajero_etereo" },
] as const;

export const OCCUPATION_BY_ID: Readonly<Record<string, OccupationOption>> = Object.fromEntries(
  OCCUPATIONS.map((o) => [o.id, o]),
);

export const ALL_OCCUPATION_IDS: readonly string[] = OCCUPATIONS.map((o) => o.id);
