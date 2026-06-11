/**
 * Client-safe lists of the destiny questionnaire option ids (occupations,
 * hobbies). Only ids ship to the browser — the roll weights / companions /
 * tendencies stay server-side (data/destiny/*). Labels are localized via i18n
 * (`destiny.occupation.<id>` / `destiny.hobby.<id>`).
 *
 * A unit test (tests/destiny-client-options.test.ts) asserts these stay in sync
 * with the canonical config in data/destiny/, so there is no drift.
 */

export const OCCUPATION_IDS = [
  "estudiante", "comerciante", "empresario", "sin_ocupacion", "artista", "ingeniero",
  "cientifico", "medico", "programador", "docente", "militar", "atleta", "obrero",
  "agricultor", "abogado", "funcionario", "chef", "musico", "escritor", "disenador",
  "conductor", "religioso", "aventurero",
] as const;

export const HOBBY_IDS = [
  "deporte", "dibujar", "videojuegos", "programar_hobby", "leer", "escribir", "musica",
  "bailar", "cocinar", "viajar", "meditar", "cine", "fotografia", "tiro", "artes_marciales",
  "coleccionar", "ajedrez", "jardineria", "vida_social", "esoterismo", "astronomia", "naturaleza",
] as const;
