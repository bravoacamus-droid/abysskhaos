/**
 * The client-safe option id lists must stay in sync with the canonical
 * server config (no drift between the quiz UI and the roll engine).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { OCCUPATION_IDS, HOBBY_IDS } from "../lib/client/destiny-options";
import { ALL_OCCUPATION_IDS } from "../data/destiny/occupations";
import { ALL_HOBBY_IDS } from "../data/destiny/hobbies";

test("client occupation ids match the server config exactly", () => {
  assert.deepEqual([...OCCUPATION_IDS].sort(), [...ALL_OCCUPATION_IDS].sort());
});

test("client hobby ids match the server config exactly", () => {
  assert.deepEqual([...HOBBY_IDS].sort(), [...ALL_HOBBY_IDS].sort());
});
