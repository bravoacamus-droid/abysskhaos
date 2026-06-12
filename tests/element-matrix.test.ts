/**
 * Elemental advantage matrix + affinity (docs/CANON.md §9).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { elementMultiplier, elementalDamageFactor, AFFINITY_OUTGOING, AFFINITY_RESIST } from "../lib/server/element-matrix";

test("natural Wu Xing cycle is advantage 1.5× / resist 0.6×", () => {
  // wood ▸ earth ▸ water ▸ fire ▸ metal ▸ wood
  const cycle = ["wood", "earth", "water", "fire", "metal"];
  for (let i = 0; i < cycle.length; i++) {
    const att = cycle[i]!;
    const def = cycle[(i + 1) % cycle.length]!;
    assert.equal(elementMultiplier(att, def), 1.5, `${att} should beat ${def}`);
    assert.equal(elementMultiplier(def, att), 0.6, `${def} should resist ${att}`);
  }
});

test("mystic cycle + Light ×2 vs Shadow special", () => {
  assert.equal(elementMultiplier("wind", "lightning"), 1.5);
  assert.equal(elementMultiplier("lightning", "shadow"), 1.5);
  assert.equal(elementMultiplier("shadow", "light"), 1.5);
  assert.equal(elementMultiplier("light", "wind"), 1.5);
  // Light/Shadow mutual rivalry: Light ×2 vs Shadow, Shadow 1.5× vs Light.
  assert.equal(elementMultiplier("light", "shadow"), 2.0);
  assert.equal(elementMultiplier("shadow", "light"), 1.5);
});

test("cross-family and unknown/null are neutral", () => {
  assert.equal(elementMultiplier("fire", "shadow"), 1); // natural vs mystic
  assert.equal(elementMultiplier("wood", "light"), 1);
  assert.equal(elementMultiplier(null, "fire"), 1);
  assert.equal(elementMultiplier("fire", null), 1);
  assert.equal(elementMultiplier("arcane", "fire"), 1); // retired legacy element
  assert.equal(elementMultiplier("fire", "arcane"), 1);
});

test("affinity: +25% dealing with own element", () => {
  const f = elementalDamageFactor({ attackElement: "fire", defenderElement: "shadow", attackerAffinity: "fire" });
  // fire vs shadow is cross-family neutral (1.0), times outgoing affinity.
  assert.equal(f, AFFINITY_OUTGOING);
});

test("affinity: −25% taken from own element, stacks with matrix", () => {
  // water attacks fire (1.5×), defender is fire-attuned hit by... water (not fire) → no resist.
  assert.equal(
    elementalDamageFactor({ attackElement: "water", defenderElement: "fire", defenderAffinity: "fire" }),
    1.5,
  );
  // fire attacks a fire-attuned defender → matrix neutral (fire vs fire) × resist.
  assert.equal(
    elementalDamageFactor({ attackElement: "fire", defenderElement: "fire", defenderAffinity: "fire" }),
    AFFINITY_RESIST,
  );
});

test("affinity outgoing + matrix advantage stack (water→fire by a water-attuned attacker)", () => {
  const f = elementalDamageFactor({
    attackElement: "water",
    defenderElement: "fire",
    attackerAffinity: "water",
  });
  assert.equal(f, 1.5 * AFFINITY_OUTGOING);
});
