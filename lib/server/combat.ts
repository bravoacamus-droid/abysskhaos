/**
 * Server-authoritative turn-based combat resolver.
 *
 * Strict rules (see feedback_security_server_authoritative):
 *   - Damage, HP, turn order, log are computed HERE and persisted.
 *   - The client only POSTs intents ("attack mob 0"). Anything sent
 *     by the client about HP / damage / who's alive is ignored —
 *     the combat_sessions row is the single source of truth.
 *   - When the player's HP drops to zero, the character is respawned
 *     server-side (HP fully restored, current_room reset to r01).
 *     The client is told via outcome='defeat' so it can play the
 *     fade + return-to-r01 animation, but the actual state move is
 *     already persistent by the time the response leaves.
 *
 * Damage formula (Phase 4b baseline — tune later):
 *   dmg = max(1, attacker_atk - target_def)
 *   No crit / elemental / status yet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CombatMob = {
  id: string;
  name: string;
  hp: number;
  max_hp: number;
  atk: number;
  def: number;
  exp: number;
  alive: boolean;
  /** Server-resolved sprite atlas so the React overlay can render
   *  the mob in side-view without round-tripping to /monsters. */
  sprite_atlas: Record<string, string> | null;
  /** Per-(animation × direction) frame URLs. Lets the combat
   *  overlay play idle / attack loops directly without an extra
   *  fetch. Keys: 'idle', 'walk', 'attack' once Phase 4c expands. */
  animation_atlas: Record<string, Record<string, string[]>> | null;
  /** Phase 4c — dedicated side-view combat atlas. CombatOverlay
   *  prefers these over sprite_atlas / animation_atlas (which are
   *  top-down for the overworld). Null while a mob hasn't had the
   *  combat art pass yet — overlay falls back gracefully. */
  combat_sprite_atlas: Record<string, string> | null;
  combat_animation_atlas: Record<string, Record<string, string[]>> | null;
};

export type CombatTurn =
  | { kind: "player" }
  | { kind: "mob"; idx: number };

/** Player action kinds. Mobs only use 'attack' for now. */
export type PlayerActionKind = "attack" | "skill" | "defend" | "dodge";

export type CombatLogEntry =
  | { turn: number; kind: "attack"; actor: "player" | string; target: "player" | string; dmg: number; target_hp_after: number; action_kind?: "attack" | "skill" }
  | { turn: number; kind: "miss"; actor: string; target: "player" | string; reason: "dodged" }
  | { turn: number; kind: "stance"; actor: "player"; mode: "defending" | "dodging" }
  | { turn: number; kind: "death"; actor: string }
  | { turn: number; kind: "victory"; exp_awarded: number; khryn_awarded: number }
  | { turn: number; kind: "defeat" };

export type CombatSessionState = {
  id: string;
  encounter_id: string;
  player_hp: number;
  player_max_hp: number;
  player_atk: number;
  player_def: number;
  mobs: CombatMob[];
  turn_order: CombatTurn[];
  turn_idx: number;
  log_entries: CombatLogEntry[];
  is_over: boolean;
  outcome: "victory" | "defeat" | null;
};

/** Build the initial session row from the character + bestiary data. */
export function buildInitialCombatSession(args: {
  encounterId: string;
  player: { hp_current: number; hp_max: number; atk: number; def: number };
  mobs: Array<{ id: string; name: string; hp_max: number; atk: number; def: number; exp: number; sprite_atlas: Record<string, string> | null; animation_atlas: Record<string, Record<string, string[]>> | null; combat_sprite_atlas: Record<string, string> | null; combat_animation_atlas: Record<string, Record<string, string[]>> | null }>;
}): Omit<CombatSessionState, "id"> {
  // Turn order: player goes first, then mobs in declared order. Phase
  // 4c will sort by AGI / initiative; for now first-attempt-friendly
  // (player gets the opening swing).
  const turn_order: CombatTurn[] = [
    { kind: "player" },
    ...args.mobs.map((_, i) => ({ kind: "mob" as const, idx: i })),
  ];
  return {
    encounter_id: args.encounterId,
    player_hp: args.player.hp_current,
    player_max_hp: args.player.hp_max,
    player_atk: args.player.atk,
    player_def: args.player.def,
    mobs: args.mobs.map((m) => ({
      id: m.id,
      name: m.name,
      hp: m.hp_max,
      max_hp: m.hp_max,
      atk: m.atk,
      def: m.def,
      exp: m.exp,
      alive: true,
      sprite_atlas: m.sprite_atlas,
      animation_atlas: m.animation_atlas,
      combat_sprite_atlas: m.combat_sprite_atlas,
      combat_animation_atlas: m.combat_animation_atlas,
    })),
    turn_order,
    turn_idx: 0,
    log_entries: [],
    is_over: false,
    outcome: null,
  };
}

/** Compute attack damage. Floor of 1 so atk-vs-def never zeroes out. */
function computeDamage(atk: number, def: number): number {
  return Math.max(1, atk - Math.floor(def / 2));
}

/** Skill action damage multiplier. Phase 4d will branch by class /
 *  weapon; for now warrior gets a flat 1.6× heavy strike. */
const SKILL_DAMAGE_MULTIPLIER = 1.6;
/** Defend stance halves incoming damage during the mob counter
 *  sequence that follows the player's turn. */
const DEFEND_DAMAGE_FACTOR = 0.5;
/** Dodge stance gives every incoming mob attack this miss chance. */
const DODGE_MISS_CHANCE = 0.5;

/** Resolve all mob counter-attacks until it's the player's turn again
 *  or the fight ends. `stance` modulates incoming damage / miss roll
 *  based on what the player chose this turn (normal / defending /
 *  dodging). Pushes log entries into `appended` and mutates `next`. */
function runMobCounterAttacks(
  next: CombatSessionState,
  appended: CombatLogEntry[],
  stance: "normal" | "defending" | "dodging",
): "continue" | "defeat" {
  next.turn_idx += 1;
  while (true) {
    const t = next.turn_order[next.turn_idx % next.turn_order.length];
    if (!t || t.kind === "player") return "continue";
    const mobIdx = t.idx;
    const attacker = next.mobs[mobIdx];
    if (!attacker || !attacker.alive) {
      next.turn_idx += 1;
      continue;
    }
    // Dodge roll first — if the player evades, no damage + log a miss.
    if (stance === "dodging" && Math.random() < DODGE_MISS_CHANCE) {
      appended.push({
        turn: next.turn_idx,
        kind: "miss",
        actor: `mob:${mobIdx}`,
        target: "player",
        reason: "dodged",
      });
      next.turn_idx += 1;
      continue;
    }
    // Compute damage; defending halves it.
    const rawDmg = computeDamage(attacker.atk, next.player_def);
    const mobDmg = stance === "defending"
      ? Math.max(1, Math.floor(rawDmg * DEFEND_DAMAGE_FACTOR))
      : rawDmg;
    next.player_hp = Math.max(0, next.player_hp - mobDmg);
    appended.push({
      turn: next.turn_idx,
      kind: "attack",
      actor: `mob:${mobIdx}`,
      target: "player",
      dmg: mobDmg,
      target_hp_after: next.player_hp,
    });
    if (next.player_hp === 0) {
      appended.push({ turn: next.turn_idx, kind: "defeat" });
      next.is_over = true;
      next.outcome = "defeat";
      return "defeat";
    }
    next.turn_idx += 1;
  }
}

function checkAllMobsDead(next: CombatSessionState, appended: CombatLogEntry[]): boolean {
  if (!next.mobs.every((m) => !m.alive)) return false;
  const exp = next.mobs.reduce((a, m) => a + m.exp, 0);
  const khryn = Math.round(exp / 3);
  appended.push({ turn: next.turn_idx, kind: "victory", exp_awarded: exp, khryn_awarded: khryn });
  next.is_over = true;
  next.outcome = "victory";
  return true;
}

/**
 * Apply ONE player action this turn, then resolve mob counter-attacks
 * until the player's turn comes up again or the fight ends. Returns
 * mutated state + appended log entries. Throws on validation failures
 * so the caller can map to 4xx.
 *
 * Supported actions (phase 4d):
 *   - attack: standard swing on `targetMobIdx`
 *   - skill:  heavy strike on `targetMobIdx`, 1.6× damage
 *   - defend: no swing; player_def doubled for incoming mob counters
 *             this turn (DEFEND_DAMAGE_FACTOR halves the damage)
 *   - dodge:  no swing; every incoming mob attack rolls 50% miss
 */
export function applyPlayerAction(
  state: CombatSessionState,
  args: { action: PlayerActionKind; targetMobIdx?: number },
): { next: CombatSessionState; appended: CombatLogEntry[] } {
  if (state.is_over) throw new Error("COMBAT_OVER");
  const currentTurn = state.turn_order[state.turn_idx % state.turn_order.length];
  if (!currentTurn || currentTurn.kind !== "player") throw new Error("NOT_PLAYER_TURN");

  const next: CombatSessionState = JSON.parse(JSON.stringify(state));
  const appended: CombatLogEntry[] = [];

  // 1) Resolve the player's action.
  if (args.action === "attack" || args.action === "skill") {
    const targetIdx = args.targetMobIdx;
    if (typeof targetIdx !== "number") throw new Error("MISSING_TARGET");
    const targetMob = next.mobs[targetIdx];
    if (!targetMob || !targetMob.alive) throw new Error("INVALID_TARGET");

    const baseDmg = computeDamage(next.player_atk, targetMob.def);
    const dmg = args.action === "skill"
      ? Math.max(1, Math.floor(baseDmg * SKILL_DAMAGE_MULTIPLIER))
      : baseDmg;
    const newHp = Math.max(0, targetMob.hp - dmg);
    targetMob.hp = newHp;
    appended.push({
      turn: next.turn_idx,
      kind: "attack",
      actor: "player",
      target: `mob:${targetIdx}`,
      dmg,
      target_hp_after: newHp,
      action_kind: args.action,
    });
    if (newHp === 0) {
      targetMob.alive = false;
      appended.push({ turn: next.turn_idx, kind: "death", actor: `mob:${targetIdx}` });
    }

    if (checkAllMobsDead(next, appended)) {
      next.log_entries = [...next.log_entries, ...appended];
      return { next, appended };
    }
  } else {
    // defend / dodge — no offensive output, just announce the stance.
    appended.push({
      turn: next.turn_idx,
      kind: "stance",
      actor: "player",
      mode: args.action === "defend" ? "defending" : "dodging",
    });
  }

  // 2) Mob counter-attacks with the appropriate stance modifier.
  const stance: "normal" | "defending" | "dodging" =
    args.action === "defend" ? "defending"
    : args.action === "dodge" ? "dodging"
    : "normal";
  runMobCounterAttacks(next, appended, stance);

  next.log_entries = [...next.log_entries, ...appended];
  return { next, appended };
}

/** Back-compat shim — Phase 4b shipped applyPlayerAttack(state, { targetMobIdx }).
 *  Keep the name so the old call sites stay valid until they're migrated. */
export function applyPlayerAttack(
  state: CombatSessionState,
  args: { targetMobIdx: number },
): { next: CombatSessionState; appended: CombatLogEntry[] } {
  return applyPlayerAction(state, { action: "attack", targetMobIdx: args.targetMobIdx });
}

/** Persist the post-combat side effects to the characters row:
 *   - Victory: HP stays where it landed in combat, add EXP + Khryn.
 *   - Defeat: full HP, current_room reset to r01 (Cave Entrance).
 * Returns the (possibly new) current_room_id so the response can
 * include the right RoomState.
 */
export async function finalizeCombat(
  supabase: SupabaseClient,
  args: {
    characterId: string;
    session: CombatSessionState;
  },
): Promise<{ current_room_id: string | null }> {
  const { session } = args;
  if (!session.is_over) {
    throw new Error("finalizeCombat called on non-over session");
  }

  if (session.outcome === "victory") {
    const victory = session.log_entries.find((e) => e.kind === "victory");
    const exp = victory && "exp_awarded" in victory ? victory.exp_awarded : 0;
    const khryn = victory && "khryn_awarded" in victory ? victory.khryn_awarded : 0;
    const { data: cur, error: selErr } = await supabase
      .from("characters")
      .select("exp, khryn, current_room_id")
      .eq("id", args.characterId)
      .single();
    if (selErr) throw new Error(`load character: ${selErr.message}`);
    const { error: upErr } = await supabase
      .from("characters")
      .update({
        hp_current: session.player_hp,
        exp: ((cur.exp as number) ?? 0) + exp,
        khryn: ((cur.khryn as number) ?? 0) + khryn,
      })
      .eq("id", args.characterId);
    if (upErr) throw new Error(`apply victory: ${upErr.message}`);
    return { current_room_id: cur.current_room_id as string | null };
  }

  // DEFEAT — full HP respawn at r01 (Cave Entrance, floor 100,
  // room_index 1). No XP / item loss yet (Phase 4c balance).
  const { data: r01, error: rErr } = await supabase
    .from("rooms")
    .select("id")
    .eq("floor_number", 100)
    .eq("room_index", 1)
    .is("character_id", null)
    .maybeSingle();
  if (rErr) throw new Error(`find r01: ${rErr.message}`);
  if (!r01) throw new Error("r01 not seeded");
  const { error: upErr } = await supabase
    .from("characters")
    .update({
      hp_current: session.player_max_hp,
      current_room_id: r01.id as string,
      current_room_entry_dir: null,
    })
    .eq("id", args.characterId);
  if (upErr) throw new Error(`apply defeat respawn: ${upErr.message}`);
  return { current_room_id: r01.id as string };
}
