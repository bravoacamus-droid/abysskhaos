/**
 * Hobby options (docs/DESTINY_ENGINE.md §5) — general categories. Same shape as
 * occupations: tendency (VIT folded into STR), lean L, 2-companion proposal,
 * passive affinity. The hobby proposes companion #1; if it collides with the
 * occupation's, rollCompanion falls back to #2.
 */

import type { HobbyOption } from "./types";

export const HOBBIES: readonly HobbyOption[] = [
  { id: "deporte", tendency: { strength: 1, agility: 1 }, lean: -0.5, companions: ["lion_cub", "dinosaur"], passive: "golpe_certero" },
  { id: "dibujar", tendency: { spirit: 1, intelligence: 1 }, lean: 0, companions: ["fairy", "sprite"], passive: "flujo_mana" },
  { id: "videojuegos", tendency: { intelligence: 1, agility: 1 }, lean: 0.6, companions: ["crystal_familiar", "drake"], passive: "reflejo_renacido" },
  { id: "programar_hobby", tendency: { intelligence: 2 }, lean: 0.8, companions: ["mecha", "crystal_familiar"], passive: "forjador_innato" },
  { id: "leer", tendency: { intelligence: 1, spirit: 1 }, lean: 0, companions: ["owlet", "wisp"], passive: "memoria_vidas" },
  { id: "escribir", tendency: { intelligence: 1, spirit: 1 }, lean: 0, companions: ["owlet", "bat"], passive: "memoria_vidas" },
  { id: "musica", tendency: { spirit: 1, agility: 1 }, lean: 0, companions: ["fairy", "phoenix_chick"], passive: "lazo_almas" },
  { id: "bailar", tendency: { agility: 1, spirit: 1 }, lean: -0.2, companions: ["kitten_spirit", "fairy"], passive: "reflejo_renacido" },
  { id: "cocinar", tendency: { agility: 1, strength: 1 }, lean: 0, companions: ["slime", "phoenix_chick"], passive: "hambre_vital" },
  { id: "viajar", tendency: { agility: 1, intelligence: 1 }, lean: 0.3, companions: ["aerodactyl", "horse_dark"], passive: "viajero_etereo" },
  { id: "meditar", tendency: { spirit: 1, strength: 1 }, lean: 0, companions: ["wisp", "horse_angel"], passive: "coraza_espiritual" },
  { id: "cine", tendency: { intelligence: 1, spirit: 1 }, lean: 0.2, companions: ["bat", "slime"], passive: "fortuna_renacido" },
  { id: "fotografia", tendency: { agility: 1, intelligence: 1 }, lean: 0.3, companions: ["falcon", "kitten_spirit"], passive: "codicia_destino" },
  { id: "tiro", tendency: { agility: 1, intelligence: 1 }, lean: 0.9, companions: ["falcon", "wolf_pup"], passive: "golpe_certero" },
  { id: "artes_marciales", tendency: { strength: 1, agility: 1 }, lean: -0.7, companions: ["dinosaur", "lion_cub"], passive: "reflejo_renacido" },
  { id: "coleccionar", tendency: { intelligence: 2 }, lean: 0, companions: ["crystal_familiar", "owlet"], passive: "codicia_destino" },
  { id: "ajedrez", tendency: { intelligence: 2 }, lean: 0.2, companions: ["serpent", "owlet"], passive: "flujo_mana" },
  { id: "jardineria", tendency: { spirit: 1, strength: 1 }, lean: -0.2, companions: ["sprite", "bear_cub"], passive: "codicia_destino" },
  { id: "vida_social", tendency: { agility: 1, spirit: 1 }, lean: 0.2, companions: ["bat", "imp"], passive: "lazo_almas" },
  { id: "esoterismo", tendency: { spirit: 1, intelligence: 1 }, lean: 0, companions: ["demon", "wisp"], passive: "nucleo_elemental" },
  { id: "astronomia", tendency: { intelligence: 1, spirit: 1 }, lean: 0.3, companions: ["wisp", "crystal_familiar"], passive: "nucleo_elemental" },
  { id: "naturaleza", tendency: { strength: 2 }, lean: -0.3, companions: ["bear_cub", "wolf_pup"], passive: "viajero_etereo" },
] as const;

export const HOBBY_BY_ID: Readonly<Record<string, HobbyOption>> = Object.fromEntries(
  HOBBIES.map((h) => [h.id, h]),
);

export const ALL_HOBBY_IDS: readonly string[] = HOBBIES.map((h) => h.id);
