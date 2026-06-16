/**
 * Destiny Engine — weighted rolls + config integrity.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ELEMENT_WEIGHTS } from "../data/destiny/elements";
import { OCCUPATIONS, OCCUPATION_BY_ID } from "../data/destiny/occupations";
import { HOBBIES, HOBBY_BY_ID } from "../data/destiny/hobbies";
import { ALL_PASSIVE_IDS } from "../data/destiny/passives";
import { DESTINY_CLASS_BY_ID, ALL_CLASS_IDS } from "../data/destiny/classes";
import { zodiacForYear } from "../data/destiny/zodiac";
import type { ClassId } from "../data/destiny/types";
import { combineTendencies, rollClass, rollElement, rollCompanion, rollWeapon, rollPassive } from "../lib/server/destiny/rolls";
import { runDestiny } from "../lib/server/destiny";
import { mulberry32 } from "../lib/server/destiny/rng";

const PET_FAMILIES = new Set([
  "drake", "wisp", "lion_cub", "sprite", "crystal_familiar", "imp", "owlet", "wolf_pup",
  "slime", "phoenix_chick", "mecha", "kitten_spirit", "bat", "falcon", "aerodactyl",
  "bear_cub", "fairy", "serpent", "demon", "horse_angel", "horse_dark", "dinosaur", "boar",
]);

// --- config integrity -------------------------------------------------------

test("every occupation & hobby references valid pet families and a valid passive, with distinct companions", () => {
  for (const opt of [...OCCUPATIONS, ...HOBBIES]) {
    assert.ok(PET_FAMILIES.has(opt.companions[0]), `${opt.id} companion#1 '${opt.companions[0]}' unknown`);
    assert.ok(PET_FAMILIES.has(opt.companions[1]), `${opt.id} companion#2 '${opt.companions[1]}' unknown`);
    assert.notEqual(opt.companions[0], opt.companions[1], `${opt.id} has duplicate companions`);
    assert.ok(ALL_PASSIVE_IDS.includes(opt.passive), `${opt.id} passive '${opt.passive}' unknown`);
    assert.ok(opt.lean >= -1 && opt.lean <= 1, `${opt.id} lean out of [-1,1]`);
  }
});

test("element weights sum to 600 with exact rarity tiers", () => {
  const total = ELEMENT_WEIGHTS.reduce((s, e) => s + e.weight, 0);
  assert.equal(total, 600);
  const byId = Object.fromEntries(ELEMENT_WEIGHTS.map((e) => [e.id, e.weight]));
  assert.equal(byId.metal, 12); // 2%
  assert.equal(byId.shadow, 30); // 5% (Oscuridad)
  assert.equal(byId.light, 48); // 8% (Luz)
});

// --- element roll -----------------------------------------------------------

test("element roll respects rarity tiers (Metal rarest)", () => {
  const rng = mulberry32(7);
  const N = 120_000;
  const counts = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const e = rollElement(rng);
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  const pct = (id: string) => (counts.get(id) ?? 0) / N;
  assert.ok(Math.abs(pct("metal") - 0.02) < 0.006, `metal ${pct("metal")}`);
  assert.ok(Math.abs(pct("shadow") - 0.05) < 0.008, `shadow ${pct("shadow")}`);
  assert.ok(Math.abs(pct("light") - 0.08) < 0.01, `light ${pct("light")}`);
  assert.ok(pct("fire") > pct("light"), "commons should beat light");
  assert.ok(pct("metal") < pct("shadow") && pct("shadow") < pct("light"), "monotonic rarity");
});

// --- class roll -------------------------------------------------------------

function dominantClass(tendency: Record<string, number>, lean: number, seed: number): ClassId {
  const rng = mulberry32(seed);
  const counts = new Map<ClassId, number>(ALL_CLASS_IDS.map((c) => [c, 0]));
  for (let i = 0; i < 20_000; i++) {
    const c = rollClass(combineTendencies(tendency), lean, rng);
    counts.set(c, counts.get(c)! + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

test("strong STR tendency favors Warrior", () => {
  assert.equal(dominantClass({ strength: 8 }, 0, 1), "warrior");
});

test("AGI+INT with +lean favors Infiltrator, −lean favors Assassin", () => {
  assert.equal(dominantClass({ agility: 6, intelligence: 6 }, 1, 2), "infiltrator");
  assert.equal(dominantClass({ agility: 6, intelligence: 6 }, -1, 3), "assassin");
});

test("INT+SPI tendency favors Mage", () => {
  assert.equal(dominantClass({ intelligence: 8, spirit: 6 }, 0, 4), "mage");
});

// --- companion roll ---------------------------------------------------------

test("companion is always one of two distinct proposals; collision falls back", () => {
  const rng = mulberry32(11);
  // estudiante #1 = owlet, leer #1 = owlet → collision → leer #2 = wisp.
  const occ = OCCUPATION_BY_ID.estudiante!;
  const hob = HOBBY_BY_ID.leer!;
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(rollCompanion(occ, hob, rng));
  assert.deepEqual([...seen].sort(), ["owlet", "wisp"]);
});

test("companion uses occupation #1 and hobby #1 when distinct", () => {
  const rng = mulberry32(13);
  const occ = OCCUPATION_BY_ID.empresario!; // [drake, lion_cub]
  const hob = HOBBY_BY_ID.tiro!; // [falcon, wolf_pup]
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) seen.add(rollCompanion(occ, hob, rng));
  assert.deepEqual([...seen].sort(), ["drake", "falcon"]);
});

// --- weapon roll ------------------------------------------------------------

test("weapon roll stays within the class pool", () => {
  const rng = mulberry32(17);
  for (const classId of ALL_CLASS_IDS) {
    const pool = new Set(DESTINY_CLASS_BY_ID[classId].weaponPool);
    for (let i = 0; i < 1000; i++) assert.ok(pool.has(rollWeapon(classId, rng)));
  }
});

// --- passive roll -----------------------------------------------------------

test("passive roll is valid and biased toward affinities", () => {
  const rng = mulberry32(19);
  const occ = OCCUPATION_BY_ID.ingeniero!; // forjador_innato
  const hob = HOBBY_BY_ID.programar_hobby!; // forjador_innato
  const counts = new Map<string, number>();
  for (let i = 0; i < 20_000; i++) {
    const p = rollPassive(occ, hob, rng);
    assert.ok(ALL_PASSIVE_IDS.includes(p));
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  // both point to forjador_innato → it should be the most frequent by far.
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  assert.equal(top, "forjador_innato");
});

// --- zodiac + end-to-end ----------------------------------------------------

test("zodiacForYear maps known years", () => {
  assert.equal(zodiacForYear(2020).id, "rata");
  assert.equal(zodiacForYear(2024).id, "dragon");
});

test("runDestiny returns a complete build with the CHOSEN class + weapon", () => {
  const ref = new Date("2026-06-11T00:00:00Z");
  const out = runDestiny(
    { birthDate: "1995-04-12", occupationId: "ingeniero", hobbyId: "programar_hobby", classId: "mage", weaponLoadoutId: "staff" },
    ref,
    mulberry32(42),
  );
  assert.equal(out.classId, "mage"); // chosen, not rolled
  assert.equal(out.weaponLoadoutId, "staff"); // chosen
  assert.ok(DESTINY_CLASS_BY_ID[out.classId].weaponPool.includes(out.weaponLoadoutId));
  assert.ok(PET_FAMILIES.has(out.companionId));
  assert.ok(ALL_PASSIVE_IDS.includes(out.passiveId));
  assert.equal(out.passiveRank, 1);
  assert.equal(out.meta.zodiacId, "cerdo"); // 1995 = Pig
});

test("runDestiny rejects underage, invalid answers, and invalid class/weapon", () => {
  const ref = new Date("2026-06-11T00:00:00Z");
  const ok = { classId: "warrior", weaponLoadoutId: "axe_2h" };
  assert.throws(() => runDestiny({ birthDate: "2020-01-01", occupationId: "ingeniero", hobbyId: "leer", ...ok }, ref, mulberry32(1)), /UNDERAGE/);
  assert.throws(() => runDestiny({ birthDate: "1990-01-01", occupationId: "nope", hobbyId: "leer", ...ok }, ref, mulberry32(1)), /INVALID_OCCUPATION/);
  assert.throws(() => runDestiny({ birthDate: "1990-01-01", occupationId: "ingeniero", hobbyId: "nope", ...ok }, ref, mulberry32(1)), /INVALID_HOBBY/);
  assert.throws(() => runDestiny({ birthDate: "bad", occupationId: "ingeniero", hobbyId: "leer", ...ok }, ref, mulberry32(1)), /INVALID_BIRTH_DATE/);
  assert.throws(() => runDestiny({ birthDate: "1990-01-01", occupationId: "ingeniero", hobbyId: "leer", classId: "nope", weaponLoadoutId: "sword_2h" }, ref, mulberry32(1)), /INVALID_CLASS/);
  assert.throws(() => runDestiny({ birthDate: "1990-01-01", occupationId: "ingeniero", hobbyId: "leer", classId: "warrior", weaponLoadoutId: "staff" }, ref, mulberry32(1)), /INVALID_WEAPON/);
});
