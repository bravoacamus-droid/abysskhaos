/**
 * Destiny Engine orchestrator — turns the 3 questionnaire answers into a full
 * rolled build (docs/DESTINY_ENGINE.md). Pure: the caller injects the RNG (seed
 * from `secureSeed()` in production) and the reference date (creation time).
 *
 * The endpoint validates the answer ids against the option tables and persists
 * the result; this module does the rolling only.
 */

import { OCCUPATION_BY_ID } from "@/data/destiny/occupations";
import { HOBBY_BY_ID } from "@/data/destiny/hobbies";
import { ageBandForAge, MIN_PLAYER_AGE } from "@/data/destiny/age-bands";
import { zodiacForYear } from "@/data/destiny/zodiac";
import { DESTINY_CLASS_BY_ID, ALL_CLASS_IDS } from "@/data/destiny/classes";
import type { ClassId, CompanionId, ElementId, PassiveId, WeaponLoadoutId } from "@/data/destiny/types";

import { rollAttributes, type RolledAttributes } from "./attributes";
import { secureSeed, mulberry32, type Rng } from "./rng";
import { rollCompanion, rollElement, rollPassive } from "./rolls";

export type DestinyAnswers = {
  /** ISO date "YYYY-MM-DD". */
  birthDate: string;
  occupationId: string;
  hobbyId: string;
  /** Player-CHOSEN class + initial weapon (2026-06-16: class is no longer
   *  rolled — the player picks it after the quiz; the rest stays rolled). */
  classId: string;
  weaponLoadoutId: string;
};

export type DestinyResult = {
  classId: ClassId;
  elementId: ElementId;
  companionId: CompanionId;
  weaponLoadoutId: WeaponLoadoutId;
  attributes: RolledAttributes;
  passiveId: PassiveId;
  passiveRank: number;
  meta: { zodiacId: string; ageBandId: string };
};

/** Parse "YYYY-MM-DD" → { year, month, day }, validating ranges. */
export function parseBirthDate(birthDate: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) throw new Error("INVALID_BIRTH_DATE");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error("INVALID_BIRTH_DATE");
  return { year, month, day };
}

/** Whole years between a birth date and a reference date. */
export function ageFromBirthDate(birth: { year: number; month: number; day: number }, reference: Date): number {
  let age = reference.getUTCFullYear() - birth.year;
  const beforeBirthday =
    reference.getUTCMonth() + 1 < birth.month ||
    (reference.getUTCMonth() + 1 === birth.month && reference.getUTCDate() < birth.day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Run the full destiny roll. `referenceDate` is the creation time. */
export function runDestiny(answers: DestinyAnswers, referenceDate: Date, rng: Rng = mulberry32(secureSeed())): DestinyResult {
  const occupation = OCCUPATION_BY_ID[answers.occupationId];
  const hobby = HOBBY_BY_ID[answers.hobbyId];
  if (!occupation) throw new Error("INVALID_OCCUPATION");
  if (!hobby) throw new Error("INVALID_HOBBY");

  // Class + weapon are player-chosen (validated here, not rolled).
  if (!ALL_CLASS_IDS.includes(answers.classId as ClassId)) throw new Error("INVALID_CLASS");
  const classId = answers.classId as ClassId;
  const pool = DESTINY_CLASS_BY_ID[classId].weaponPool;
  if (!pool.includes(answers.weaponLoadoutId as WeaponLoadoutId)) throw new Error("INVALID_WEAPON");
  const weaponLoadoutId = answers.weaponLoadoutId as WeaponLoadoutId;

  const birth = parseBirthDate(answers.birthDate);
  const age = ageFromBirthDate(birth, referenceDate);
  if (age < MIN_PLAYER_AGE) throw new Error("UNDERAGE");

  const zodiac = zodiacForYear(birth.year);
  const ageBand = ageBandForAge(age);

  // Element / companion / passive / attributes are still rolled from the quiz.
  const elementId = rollElement(rng);
  const companionId = rollCompanion(occupation, hobby, rng);
  const attributes = rollAttributes(classId, rng);
  const passiveId = rollPassive(occupation, hobby, rng);

  return {
    classId,
    elementId,
    companionId,
    weaponLoadoutId,
    attributes,
    passiveId,
    passiveRank: 1,
    meta: { zodiacId: zodiac.id, ageBandId: ageBand.id },
  };
}

export { secureSeed, mulberry32 } from "./rng";
export type { Rng } from "./rng";
