"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { t, type Locale } from "@/lib/i18n";
import { elementMultiplier } from "@/lib/server/element-matrix";
import type {
  CharacterItem,
  CombatLogEntry,
  CombatSession,
  CombatTurn,
  ElementOrb,
  EncounterMob,
  ItemCatalogEntry,
  PlayerActionKind,
  RoomState,
} from "@/lib/client/api";

/**
 * Phase 4d Combat Overlay — Final Fantasy VI Pixel Remaster styling.
 *
 * Layout (top → bottom):
 *   - Battlefield: enemies anchored LEFT (always), party on RIGHT.
 *     One horizontal flex row sharing a baseline so all entities
 *     stand on the same ground line.
 *   - Bottom HUD: two boxes side by side with the FFVI blue-gradient
 *     fill + white rounded border the user asked for. LEFT box is the
 *     4-action command list (Attack / Skill / Defend / Dodge); RIGHT
 *     box is the active party panel (player name, level, HP, MP).
 *     A blinking pointing-glove cursor highlights the focused action
 *     on the player's turn and goes still when it's the enemy's turn
 *     — the FFVI tell.
 *
 * Sprites use a state machine: idle / attack / skill / hurt / dodge /
 * block / death / victory. <CharacterStage> swaps frame sources from
 * the combat_animation_atlas and steps with a single setInterval.
 * Server is authoritative — onAction returns the resolved log, this
 * component just animates the steps in playAppended().
 */

type FloatingNumber = {
  id: number;
  /** "player" or "mob:idx" */
  target: string;
  value: number | "MISS";
  variant: "damage" | "miss";
};

type AnimState =
  | "idle"
  | "weakened"
  | "attack"
  | "skill"
  | "hurt"
  | "dodge"
  | "block"
  | "death"
  | "victory";

const ANIM_HINT: Record<AnimState, { fps: number; loop: boolean; hold: boolean }> = {
  idle:     { fps: 6,  loop: true,  hold: false },
  weakened: { fps: 5,  loop: true,  hold: false },
  attack:   { fps: 10, loop: false, hold: false },
  skill:    { fps: 10, loop: false, hold: false },
  hurt:     { fps: 12, loop: false, hold: false },
  dodge:    { fps: 14, loop: false, hold: false },
  block:    { fps: 8,  loop: false, hold: true  },
  death:    { fps: 8,  loop: false, hold: true  },
  victory:  { fps: 6,  loop: true,  hold: false },
};

/** Below this HP fraction the player's resting state flips from
 *  'idle' to 'weakened' (heavier breathing, hunched pose). */
const LOW_HP_THRESHOLD = 0.25;

/** Mob IDs that fight at range — their attacks spawn a flying
 *  projectile FX from their position to the player. */
const RANGED_MOB_IDS = new Set(["lizardman_archer"]);

const ACTIONS: { kind: PlayerActionKind; labelKey: string; needsTarget: boolean }[] = [
  { kind: "attack", labelKey: "combat.action_attack", needsTarget: true  },
  { kind: "skill",  labelKey: "combat.action_skill",  needsTarget: true  },
  { kind: "defend", labelKey: "combat.action_defend", needsTarget: false },
  { kind: "dodge",  labelKey: "combat.action_dodge",  needsTarget: false },
];

/** Per-mob horizontal flip when a generation's east rotation reads
 *  mirrored. The new chibi-pivot art (Lizardman Archer detailed
 *  combat) already faces the player correctly so no flip needed.
 *  Map kept as a hook for future mobs whose generated east reads
 *  wrong. */
const MOB_SPRITE_FLIP: Record<string, boolean> = {};

type Props = {
  locale: Locale;
  session: CombatSession;
  player: RoomState["player"];
  /** Player's equipped items + the catalog lookup so we can resolve
   *  the active weapon family (sword_1h, axe_2h, sword_1h_shield, …)
   *  and pick the right per-weapon animation set. */
  equipped: CharacterItem[];
  itemCatalog: Record<string, ItemCatalogEntry>;
  mobs: EncounterMob[];
  /** Orb art per element id (player + mobs) for the affinity HUD. */
  elements: Record<string, ElementOrb>;
  backdropUrl: string | null;
  onAction: (
    action: PlayerActionKind,
    targetMobIdx?: number,
  ) => Promise<{ nextSession: CombatSession; appended: CombatLogEntry[] }>;
  onClose: (outcome: "victory" | "defeat") => void;
};

/** Maps the equipped main-hand + off-hand to the warrior's
 *  animation family key (used as the suffix in combat atlas keys —
 *  e.g. attack_axe_2h, idle_sword_1h_shield).
 *
 *  Rule:
 *   - two_handed weapon → <weapon_class>_2h
 *   - one_handed weapon + shield → <weapon_class>_1h_shield
 *   - one_handed weapon alone → <weapon_class>_1h
 *   - nothing equipped → sword_1h (default legacy keys)
 */
function resolveWeaponFamily(
  equipped: CharacterItem[],
  catalog: Record<string, ItemCatalogEntry>,
): string {
  const main = equipped.find((e) => e.slot === "main_hand");
  if (!main) return "sword_1h";
  const w = catalog[main.item_id]?.weapon;
  if (!w) return "sword_1h";
  // Normalize weapon_class to our family naming (sword | axe). Any
  // unknown class falls back to sword for graceful art reuse.
  const wc = w.weapon_class === "axe" ? "axe" : "sword";
  if (w.handedness === "two_handed") return `${wc}_2h`;
  // One-handed: detect a shield in off-hand for the +shield variant.
  const off = equipped.find((e) => e.slot === "off_hand");
  const offIsShield = off
    ? catalog[off.item_id]?.armor?.slot === "off_hand_shield"
    : false;
  return offIsShield ? `${wc}_1h_shield` : `${wc}_1h`;
}

const HIT_FLASH_MS = 320;
const FLOAT_LIFETIME_MS = 1100;

export function CombatOverlay({
  locale,
  session: initialSession,
  player,
  equipped,
  itemCatalog,
  mobs,
  elements,
  backdropUrl,
  onAction,
  onClose,
}: Props) {
  // Resolve the active weapon family once per render (cheap). Used
  // to suffix atlas keys (idle_axe_2h, attack_sword_1h_shield, …).
  const weaponFamily = useMemo(
    () => resolveWeaponFamily(equipped, itemCatalog),
    [equipped, itemCatalog],
  );
  const [session, setSession] = useState<CombatSession>(initialSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitFlash, setHitFlash] = useState<Set<string>>(new Set());
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const floatIdRef = useRef(1);
  const [showOutcomeCard, setShowOutcomeCard] = useState(initialSession.is_over);
  const [playing, setPlaying] = useState(false);
  /** Index of the action the player is hovering / has highlighted. */
  const [actionIdx, setActionIdx] = useState(0);
  /** When non-null we're in the target-selection sub-state: the
   *  command box dims, an arrow cursor appears beside the focused
   *  mob, and a confirm tap fires the pending action against that
   *  index. Null = command picker active. */
  const [targetPicker, setTargetPicker] = useState<{ pendingAction: PlayerActionKind; targetIdx: number } | null>(null);
  /** Per-entity animation state. */
  const [animStates, setAnimStates] = useState<Record<string, AnimState>>(() => {
    const s: Record<string, AnimState> = { player: "idle" };
    initialSession.mobs.forEach((_, i) => { s[`mob:${i}`] = "idle"; });
    return s;
  });
  /** Lunge state — entities apply a CSS step-back-step-forward
   *  transform while they're swinging. Keyed same as animStates. */
  const [lungeKeys, setLungeKeys] = useState<Set<string>>(new Set());

  /** Pre-fetch every combat frame the FIRST time this overlay mounts
   *  so the browser has them cached before playAppended starts cycling
   *  src. Without this the first combat shows nothing animated — the
   *  img swaps point to URLs that are still being downloaded. */
  useEffect(() => {
    const urls: string[] = [];
    const collect = (atlas?: Record<string, Record<string, string[]>> | null) => {
      if (!atlas) return;
      for (const state of Object.values(atlas)) {
        for (const frames of Object.values(state)) {
          for (const u of frames) urls.push(u);
        }
      }
    };
    collect(player.combat_animation_atlas);
    collect(player.animation_atlas);
    mobs.forEach((m) => {
      collect(m.combat_animation_atlas);
      collect(m.animation_atlas);
    });
    initialSession.mobs.forEach((m) => {
      collect(m.combat_animation_atlas);
      collect(m.animation_atlas);
    });
    for (const u of new Set(urls)) {
      const img = new Image();
      img.src = u;
    }
  }, [player, mobs, initialSession.mobs]);

  const currentTurn: CombatTurn =
    session.turn_order[session.turn_idx % session.turn_order.length] ?? { kind: "player" };
  const isPlayerTurn = currentTurn.kind === "player" && !session.is_over && !busy && !playing;

  function setEntityAnim(key: string, state: AnimState) {
    setAnimStates((prev) => ({ ...prev, [key]: state }));
  }

  function sleep(ms: number) {
    return new Promise((res) => window.setTimeout(res, ms));
  }

  function pushFloat(target: string, value: number | "MISS", variant: "damage" | "miss") {
    const id = floatIdRef.current++;
    setFloats((prev) => [...prev, { id, target, value, variant }]);
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id));
    }, FLOAT_LIFETIME_MS);
  }

  function flashEntity(key: string) {
    setHitFlash((prev) => new Set([...prev, key]));
    window.setTimeout(() => {
      setHitFlash((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }, HIT_FLASH_MS);
  }

  /** Add/remove a lunge key + auto-clear after the keyframe duration. */
  function pulseLunge(key: string, durMs: number) {
    setLungeKeys((prev) => new Set([...prev, key]));
    window.setTimeout(() => {
      setLungeKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }, durMs);
  }
  /** Spawn a one-shot slash FX over the target. */
  const [slashFx, setSlashFx] = useState<Array<{ id: number; target: string }>>([]);
  const slashIdRef = useRef(1);
  function pushSlash(target: string) {
    const id = slashIdRef.current++;
    setSlashFx((prev) => [...prev, { id, target }]);
    window.setTimeout(() => {
      setSlashFx((prev) => prev.filter((s) => s.id !== id));
    }, 380);
  }
  /** Spawn a flying arrow projectile across the battlefield. The
   *  fromMobIdx is used to map the spawn x position to the mob's
   *  cluster; target is always the player (right side). */
  const [projectiles, setProjectiles] = useState<Array<{ id: number; fromMobIdx: number }>>([]);
  const projectileIdRef = useRef(1);
  function pushProjectile(fromMobIdx: number, lifetimeMs: number) {
    const id = projectileIdRef.current++;
    setProjectiles((prev) => [...prev, { id, fromMobIdx }]);
    window.setTimeout(() => {
      setProjectiles((prev) => prev.filter((p) => p.id !== id));
    }, lifetimeMs);
  }

  /** Walk through the server-resolved log entries and animate them
   *  one-by-one so the user actually SEES the swing connect + the
   *  target flinch. */
  async function playAppended(appended: CombatLogEntry[]) {
    setPlaying(true);
    for (const entry of appended) {
      if (entry.kind === "attack") {
        const isSkill = entry.action_kind === "skill" && entry.actor === "player";
        const actorState: AnimState = isSkill ? "skill" : "attack";
        const ATTACK_BUDGET_MS = 1200;
        // Detect a ranged mob attack on the player → spawn projectile.
        const actorIsRangedMob = (() => {
          const m = entry.actor.match(/^mob:(\d+)$/);
          if (!m) return null;
          const idx = Number(m[1]);
          const mobId = session.mobs[idx]?.id;
          return mobId && RANGED_MOB_IDS.has(mobId) ? idx : null;
        })();
        setEntityAnim(entry.actor, actorState);
        pulseLunge(entry.actor, ATTACK_BUDGET_MS);
        // Wind-up: 60% of the budget so frames 0-6 (anticipation +
        // first slash arc) play out.
        await sleep(Math.round(ATTACK_BUDGET_MS * 0.6));
        // For ranged: arrow flies during the impact window (~320ms),
        // arriving roughly at the hurt beat.
        if (actorIsRangedMob !== null) {
          pushProjectile(actorIsRangedMob, 320);
          await sleep(280);
        }
        setEntityAnim(entry.target, "hurt");
        flashEntity(entry.target);
        pushFloat(entry.target, entry.dmg, "damage");
        if (!isSkill && actorIsRangedMob === null) pushSlash(entry.target);
        // Follow-through: remaining 40% of the budget so frames 7-10
        // (recovery / return to ready) finish.
        await sleep(Math.round(ATTACK_BUDGET_MS * 0.4));
        setAnimStates((prev) => ({
          ...prev,
          [entry.actor]:  prev[entry.actor]  === "death" ? "death" : "idle",
          [entry.target]: prev[entry.target] === "death" ? "death" : "idle",
        }));
        await sleep(150);
      } else if (entry.kind === "miss") {
        setEntityAnim(entry.actor, "attack");
        await sleep(280);
        setEntityAnim(entry.target, "dodge");
        pushFloat(entry.target, "MISS", "miss");
        await sleep(600);
        setAnimStates((prev) => ({
          ...prev,
          [entry.actor]:  prev[entry.actor]  === "death" ? "death" : "idle",
          [entry.target]: prev[entry.target] === "death" ? "death" : "idle",
        }));
      } else if (entry.kind === "stance") {
        if (entry.mode === "defending") {
          setEntityAnim("player", "block");
        }
        await sleep(300);
      } else if (entry.kind === "death") {
        // Mobs skip the death animation entirely — the dissolve-fade
        // overlay already reads as the death beat, and an extra
        // anim on top muddies the moment. Player gets the full
        // kneel-on-sword death.
        if (entry.actor === "player") {
          setEntityAnim(entry.actor, "death");
        }
        await sleep(600);
      } else if (entry.kind === "victory") {
        setEntityAnim("player", "victory");
        await sleep(500);
      } else if (entry.kind === "defeat") {
        setEntityAnim("player", "death");
        await sleep(600);
      }
    }
    setPlaying(false);
  }

  async function handleAction(action: PlayerActionKind, targetIdx?: number) {
    if (busy || playing || session.is_over) return;
    setBusy(true);
    setError(null);
    try {
      const { nextSession, appended } = await onAction(action, targetIdx);
      await playAppended(appended);
      setSession(nextSession);
      if (nextSession.is_over) {
        window.setTimeout(() => setShowOutcomeCard(true), 600);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const defaultTargetIdx = useMemo(
    () => session.mobs.findIndex((m) => m.alive),
    [session.mobs],
  );

  function triggerSelectedAction() {
    const choice = ACTIONS[actionIdx];
    if (!choice) return;
    if (choice.needsTarget) {
      if (defaultTargetIdx < 0) return;
      const aliveCount = session.mobs.filter((m) => m.alive).length;
      if (aliveCount > 1) {
        // Open target picker — let the player choose explicitly.
        setTargetPicker({ pendingAction: choice.kind, targetIdx: defaultTargetIdx });
        return;
      }
      // Single target left — fire directly.
      void handleAction(choice.kind, defaultTargetIdx);
      return;
    }
    void handleAction(choice.kind);
  }

  function confirmTarget() {
    if (!targetPicker) return;
    const idx = targetPicker.targetIdx;
    const action = targetPicker.pendingAction;
    setTargetPicker(null);
    void handleAction(action, idx);
  }

  function cancelTarget() {
    setTargetPicker(null);
  }

  function cycleTarget(delta: 1 | -1) {
    if (!targetPicker) return;
    const alive: number[] = session.mobs
      .map((m, i) => (m.alive ? i : -1))
      .filter((i) => i >= 0);
    if (alive.length === 0) return;
    const cur = alive.indexOf(targetPicker.targetIdx);
    const next = alive[(cur + delta + alive.length) % alive.length]!;
    setTargetPicker({ ...targetPicker, targetIdx: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-abyss-void text-white">
      {/* Cinematic backdrop. */}
      <div className="pointer-events-none absolute inset-0">
        {backdropUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backdropUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: "brightness(0.7) saturate(0.9)" }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-abyss-void/35 via-abyss-deep/40 to-abyss-coal/70" />
      </div>

      {/* Battlefield — FFVI / Octopath composition:
            LEFT half  → enemies stacked VERTICALLY, centered. With
                         3-4 mobs we break into a back column + a
                         front column (the front column staggers
                         up/down per the user's request).
            RIGHT half → player CENTERED vertically + horizontally.

          During the target picker phase the focused mob is haloed
          + an arrow cursor sits beside them. */}
      <div className="relative flex-1">
        <div className="absolute inset-x-0 bottom-1 top-4 grid grid-cols-2 gap-2 px-3">
          {/* Enemies — vertically stacked, centered. Multi-column
              layout for 3-4 mobs handled by enemyLayout(). */}
          <div className="flex items-center justify-center">
            <EnemyCluster
              mobs={session.mobs}
              encounterMobs={mobs}
              elements={elements}
              playerElement={session.player_element}
              animStates={animStates}
              hitFlash={hitFlash}
              floats={floats}
              slashFx={slashFx}
              lungeKeys={lungeKeys}
              targetPickerIdx={targetPicker?.targetIdx ?? null}
              onPickTarget={(idx) => {
                if (targetPicker && session.mobs[idx]?.alive) {
                  setTargetPicker({ ...targetPicker, targetIdx: idx });
                }
              }}
            />
          </div>

          {/* Player — centered. Lunges LEFT (toward enemies) on attack. */}
          <div className="flex items-center justify-center">
            <div
              className={"relative aspect-square w-full max-w-[320px] " + (lungeKeys.has("player") ? "abyss-lunge-left" : "")}
            >
              {(() => {
                const csSouthWest = player.combat_sprite_atlas?.["south-west"] ?? null;
                const csWest = player.combat_sprite_atlas?.west ?? null;
                const csEast = player.combat_sprite_atlas?.east ?? null;
                const topSouth = player.sprite_atlas?.south ?? null;
                const baseSprite = csSouthWest ?? csWest ?? csEast ?? topSouth ?? null;
                // Octopath HD-2D convention: player on RIGHT half
                // facing toward enemies on the left. The 3/4 angle
                // for that is "south-west" (face + both shoulders
                // visible, turned toward camera + slightly left).
                // We prefer the new south-west key, fall back to the
                // older west-only atlas, then flip the east variant
                // as last resort.
                const combatAtlasHasSouthWest = !!player.combat_animation_atlas?.idle?.["south-west"];
                const combatAtlasHasWest = !!player.combat_animation_atlas?.idle?.west;
                const facing: "east" | "west" | "south-east" | "south-west" =
                  combatAtlasHasSouthWest ? "south-west"
                  : combatAtlasHasWest ? "west"
                  : "east";
                const flip = !combatAtlasHasSouthWest && !combatAtlasHasWest && (!!csEast || !!topSouth || !!player.combat_animation_atlas);
                // Auto-swap the resting state to 'weakened' once the
                // player drops below LOW_HP_THRESHOLD. Other states
                // (attack/skill/hurt/block/death) are untouched —
                // they only act while the action is playing.
                const rawState = animStates["player"] ?? "idle";
                const hpFrac = session.player_max_hp > 0
                  ? session.player_hp / session.player_max_hp
                  : 1;
                const playerState: AnimState =
                  rawState === "idle" && hpFrac < LOW_HP_THRESHOLD
                    ? "weakened"
                    : rawState;
                return (
                  <CharacterStage
                    baseSprite={baseSprite}
                    atlas={player.combat_animation_atlas ?? player.animation_atlas ?? null}
                    facing={facing}
                    flipFallback={flip}
                    state={playerState}
                    stateSuffix={weaponFamily}
                    flash={hitFlash.has("player")}
                    grayscale={false}
                    debugLabel={player.name}
                  />
                );
              })()}
              {floats
                .filter((f) => f.target === "player")
                .map((f) => (
                  <FloatingDamage key={f.id} value={f.value} variant={f.variant} />
                ))}
              {slashFx
                .filter((s) => s.target === "player")
                .map((s) => (
                  <SlashBurst key={s.id} />
                ))}
            </div>
          </div>
          {/* Projectiles — absolutely positioned over the whole
              battlefield, fly from the LEFT (enemy cluster) to the
              RIGHT (player). Rendered here so they're not clipped by
              either entity slot. */}
          {projectiles.map((p) => (
            <ProjectileArrow key={p.id} />
          ))}
        </div>
      </div>

      {/* Lunge + slash + projectile keyframes — scoped to this overlay. */}
      <style>{`
        @keyframes abyssLungeLeft {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(16px); }
          45%  { transform: translateX(-44px); }
          75%  { transform: translateX(-24px); }
          100% { transform: translateX(0); }
        }
        @keyframes abyssLungeRight {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(-16px); }
          45%  { transform: translateX(44px); }
          75%  { transform: translateX(24px); }
          100% { transform: translateX(0); }
        }
        .abyss-lunge-left  { animation: abyssLungeLeft 600ms ease-out; }
        .abyss-lunge-right { animation: abyssLungeRight 600ms ease-out; }
        @keyframes abyssArrowFly {
          0%   { left: 22%; opacity: 0; transform: translateY(-50%) scaleX(0.6); }
          12%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { left: 78%; opacity: 0.2; transform: translateY(-50%) scaleX(1); }
        }
        @keyframes abyssMobDissolve {
          0%   { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
          40%  { opacity: 0.85; filter: brightness(1.6); }
          100% { opacity: 0; transform: translateY(8px) scale(0.92); filter: brightness(1) blur(2px); }
        }
        .abyss-mob-dissolve { animation: abyssMobDissolve 900ms ease-out 200ms forwards; }
      `}</style>

      {/* FFVI-style bottom HUD: two blue-gradient boxes with white
          rounded borders. LEFT = command list with the blinking
          pointing glove. RIGHT = active party panel. */}
      <div className="relative grid grid-cols-2 gap-3 px-3 pb-3">
        <FFVIBox>
          {targetPicker ? (
            // TARGET PICKER — replaces the command list while the
            // player chooses which enemy to hit.
            <div className="flex flex-col gap-2">
              <p
                className="text-[11px] uppercase tracking-widest text-amber-200"
                style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
              >
                {t(locale, "combat.pick_target")}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => cycleTarget(-1)}
                  className="rounded bg-sky-600/80 px-1 py-1 text-[13px] font-bold uppercase tracking-widest text-white hover:bg-sky-600"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => cycleTarget(1)}
                  className="rounded bg-sky-600/80 px-1 py-1 text-[13px] font-bold uppercase tracking-widest text-white hover:bg-sky-600"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={confirmTarget}
                disabled={busy || playing}
                className="rounded bg-amber-500 px-2 py-1.5 text-[12px] font-bold uppercase tracking-widest text-abyss-void hover:bg-amber-400 disabled:opacity-40"
              >
                {t(locale, "combat.confirm")}
              </button>
              <button
                type="button"
                onClick={cancelTarget}
                disabled={busy || playing}
                className="rounded bg-abyss-coal/70 px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-abyss-coal disabled:opacity-40"
              >
                {t(locale, "combat.cancel")}
              </button>
            </div>
          ) : (
            // COMMAND LIST — default state.
            <div className="flex flex-col gap-1.5">
              {ACTIONS.map((a, idx) => {
                const isSelected = idx === actionIdx;
                const disabled =
                  !isPlayerTurn || (a.needsTarget && defaultTargetIdx < 0);
                return (
                  <button
                    key={a.kind}
                    type="button"
                    disabled={disabled}
                    onMouseEnter={() => setActionIdx(idx)}
                    onClick={() => {
                      setActionIdx(idx);
                      if (!disabled) triggerSelectedAction();
                    }}
                    className={
                      "flex items-center gap-2 rounded px-1.5 py-1 text-left text-[14px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 " +
                      (isSelected
                        ? "text-amber-300"
                        : "text-white hover:text-amber-200")
                    }
                    style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
                  >
                    <PointingGlove
                      visible={isSelected}
                      blinking={isPlayerTurn}
                    />
                    <span>{t(locale, a.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </FFVIBox>

        <FFVIBox>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {session.player_element ? (
                <ElementOrbView
                  orb={elements[session.player_element] ?? null}
                  size={34}
                  animate
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span
                    className="truncate text-[14px] font-bold uppercase tracking-widest text-white"
                    style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
                  >
                    {player.name}
                  </span>
                  <span
                    className="text-[11px] uppercase tracking-widest text-amber-200"
                    style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
                  >
                    Nv.{player.level}
                  </span>
                </div>
                <p
                  className="text-[10px] uppercase tracking-widest text-sky-200"
                  style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
                >
                  {player.class_name}
                  {session.player_element && elements[session.player_element]
                    ? ` · ${elements[session.player_element]!.name}`
                    : ""}
                </p>
              </div>
            </div>
            <StatBar
              label="PV"
              tone="hp"
              value={session.player_hp}
              max={session.player_max_hp}
            />
            {player.mp_max_effective > 0 ? (
              <StatBar
                label="PM"
                tone="mp"
                value={player.mp_current}
                max={player.mp_max_effective}
              />
            ) : null}
            <div
              className="mt-1 text-center text-[10px] uppercase tracking-widest text-white/70"
              style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
            >
              {playing
                ? t(locale, "combat.resolving")
                : isPlayerTurn
                  ? t(locale, "combat.your_turn")
                  : t(locale, "combat.enemy_turn")}
            </div>
            {error ? (
              <p className="text-center text-[10px] text-rose-300">{error}</p>
            ) : null}
          </div>
        </FFVIBox>
      </div>

      {showOutcomeCard && session.outcome ? (
        <OutcomeCard
          outcome={session.outcome}
          session={session}
          locale={locale}
          onClose={() => onClose(session.outcome!)}
        />
      ) : null}
    </div>
  );
}

/**
 * EnemyCluster — lays out mobs per the user's spec:
 *   1: single sprite centered
 *   2: stacked vertically, centered + spaced
 *   3: 1 back column + 2 front (front staggered up/down)
 *   4: 2 back stacked + 2 front staggered (up/down)
 * Larger counts fall back to the 4-mob pattern with the extras
 * appended to the back column.
 *
 * The focused mob (during a target-picker) gets an amber halo + a
 * pointing-arrow cursor so the player can SEE which one is selected.
 */
function EnemyCluster({
  mobs,
  encounterMobs,
  elements,
  playerElement,
  animStates,
  hitFlash,
  floats,
  slashFx,
  lungeKeys,
  targetPickerIdx,
  onPickTarget,
}: {
  mobs: CombatSession["mobs"];
  encounterMobs: EncounterMob[];
  elements: Record<string, ElementOrb>;
  playerElement: string | null;
  animStates: Record<string, AnimState>;
  hitFlash: Set<string>;
  floats: FloatingNumber[];
  slashFx: Array<{ id: number; target: string }>;
  lungeKeys: Set<string>;
  targetPickerIdx: number | null;
  onPickTarget: (idx: number) => void;
}) {
  // [col, rowOffsetUnits] where col 0 = back, col 1 = front; row offset
  // in units of ~28px (one tile-ish staggered).
  const positions = enemyLayout(mobs.length);
  const cols: Array<Array<{ idx: number; offset: number }>> = [[], []];
  positions.forEach((p, i) => {
    cols[p.col]!.push({ idx: i, offset: p.offset });
  });
  return (
    <div className="flex h-full w-full items-center justify-center gap-3">
      {cols.map((col, colIdx) =>
        col.length === 0 ? null : (
          <div key={colIdx} className="flex flex-col items-center justify-center gap-3">
            {col.map(({ idx, offset }) => {
              const m = mobs[idx]!;
              const mobMeta = encounterMobs[idx];
              const key = `mob:${idx}`;
              const state = animStates[key] ?? "idle";
              const isHit = hitFlash.has(key);
              const isFocused = targetPickerIdx === idx;
              // Octopath HD-2D convention: enemies stand on the LEFT
              // half of the screen facing the player. The proper 3/4
              // angle is "south-east" (face + both shoulders visible,
              // turned toward the camera + slightly to the right).
              const baseSprite =
                m.combat_sprite_atlas?.["south-east"] ??
                mobMeta?.combat_sprite_atlas?.["south-east"] ??
                m.combat_sprite_atlas?.east ??
                mobMeta?.combat_sprite_atlas?.east ??
                m.sprite_atlas?.east ??
                mobMeta?.sprite_atlas?.east ??
                m.sprite_atlas?.south ??
                mobMeta?.sprite_atlas?.south ??
                null;
              const atlas =
                m.combat_animation_atlas ??
                mobMeta?.combat_animation_atlas ??
                m.animation_atlas ??
                mobMeta?.animation_atlas ??
                null;
              return (
                <div
                  key={idx}
                  className={
                    "relative flex flex-col items-center gap-1 transition-transform " +
                    (isFocused ? "scale-[1.05] " : "") +
                    // Dead mobs: smooth fade-out (forwards holds at
                    // opacity 0 + scaled down). NOT grayscale per
                    // user feedback.
                    (!m.alive ? "abyss-mob-dissolve pointer-events-none " : "")
                  }
                  style={{ transform: `translateY(${offset * 18}px)` }}
                >
                  <div
                    className={
                      "relative aspect-square w-full max-w-[400px] " +
                      (isFocused ? "drop-shadow-[0_0_8px_rgba(252,211,77,0.85)] " : "") +
                      (lungeKeys.has(key) ? "abyss-lunge-right" : "")
                    }
                  >
                    {/* Pointing-arrow cursor for the picker. */}
                    {isFocused ? (
                      <span
                        className="pointer-events-none absolute -left-5 top-1/2 -translate-y-1/2 text-2xl text-amber-300"
                        style={{
                          textShadow: "0 0 4px #000",
                          animation: "abyssCursorBlink 0.7s steps(2) infinite",
                        }}
                      >
                        ▶
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onPickTarget(idx)}
                      disabled={!m.alive || targetPickerIdx === null}
                      className="absolute inset-0 cursor-pointer disabled:cursor-default"
                      aria-label={mobMeta?.name_localized ?? m.name}
                    >
                      <span className="sr-only">{mobMeta?.name_localized ?? m.name}</span>
                    </button>
                    <CharacterStage
                      baseSprite={baseSprite}
                      atlas={atlas}
                      // Prefer new Octopath 3/4 south-east when atlas
                      // has it; legacy east still works.
                      facing={(atlas?.idle?.["south-east"] ? "south-east" : "east")}
                      state={state}
                      flash={isHit}
                      grayscale={false}
                      flipFallback={MOB_SPRITE_FLIP[m.id] ?? false}
                      staticIdle={true}
                      debugLabel={m.name}
                    />
                    {floats
                      .filter((f) => f.target === key)
                      .map((f) => (
                        <FloatingDamage key={f.id} value={f.value} variant={f.variant} />
                      ))}
                    {slashFx
                      .filter((s) => s.target === key)
                      .map((s) => (
                        <SlashBurst key={s.id} />
                      ))}
                  </div>
                  <div className="w-full max-w-[200px]">
                    <div className="flex items-center justify-between gap-1 text-[9px] font-semibold text-white drop-shadow">
                      <span className="flex min-w-0 items-center gap-1">
                        {m.element && elements[m.element] ? (
                          <ElementOrbView orb={elements[m.element] ?? null} size={16} />
                        ) : null}
                        <span className="truncate">{mobMeta?.name_localized ?? m.name}</span>
                        {m.alive ? (
                          <AdvantageBadge factor={elementMultiplier(playerElement, m.element)} />
                        ) : null}
                      </span>
                      <span className="tabular-nums text-abyss-fog">{m.hp}/{m.max_hp}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded bg-abyss-coal/70 ring-1 ring-white/25">
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${m.max_hp > 0 ? Math.max(0, (m.hp / m.max_hp) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}

function enemyLayout(n: number): Array<{ col: 0 | 1; offset: number }> {
  if (n <= 1) return [{ col: 0, offset: 0 }];
  if (n === 2) return [
    { col: 0, offset: -1 },
    { col: 0, offset: 1 },
  ];
  if (n === 3) return [
    { col: 0, offset: 0 },
    { col: 1, offset: -1 },
    { col: 1, offset: 1 },
  ];
  if (n === 4) return [
    { col: 0, offset: -1 },
    { col: 0, offset: 1 },
    { col: 1, offset: -1 },
    { col: 1, offset: 1 },
  ];
  // 5+: 4-mob template + extras stacked at the back.
  const base = enemyLayout(4);
  for (let i = 4; i < n; i++) {
    base.push({ col: 0, offset: i - 4 });
  }
  return base;
}

/** FFVI-style command box — blue gradient fill, white rounded border,
 *  drop shadow. Reusable for the command list + party panel. */
function FFVIBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-2.5 shadow-xl"
      style={{
        background: "linear-gradient(180deg, #2a52c7 0%, #0a1a5e 100%)",
        border: "2px solid rgba(255,255,255,0.92)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.45) inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
    >
      {children}
    </div>
  );
}

/** A small element orb. With `animate` it cycles the 9-frame flicker
 *  atlas (living element); otherwise it shows the single static frame.
 *  Used both in the player party panel (big, animated) and beside each
 *  enemy (tiny, static) as the affinity readout. */
function ElementOrbView({
  orb,
  size,
  animate = false,
}: {
  orb: ElementOrb | null;
  size: number;
  animate?: boolean;
}) {
  const frames = useMemo(
    () => (orb?.orb_atlas && orb.orb_atlas.length > 0 ? orb.orb_atlas : orb?.orb_url ? [orb.orb_url] : []),
    [orb],
  );
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animate || frames.length <= 1) return;
    frames.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    const id = window.setInterval(() => setFrame((f) => (f + 1) % frames.length), 110);
    return () => window.clearInterval(id);
  }, [animate, frames]);

  if (frames.length === 0) return null;
  const src = animate ? (frames[frame] ?? frames[0]) : frames[0];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={orb?.name ?? ""}
      width={size}
      height={size}
      className="shrink-0 object-contain drop-shadow-[0_0_4px_rgba(120,120,255,0.35)]"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}

/** Tiny chevron telling the player whether their element is strong (▲),
 *  weak (▼) or neutral (—) against this enemy's element. Driven by the
 *  same matrix the server uses, so it never lies about the math. */
function AdvantageBadge({ factor }: { factor: number }) {
  if (factor > 1) {
    return (
      <span className="shrink-0 font-black leading-none text-emerald-400" style={{ textShadow: "0 0 3px #000" }} title="ventaja">
        ▲
      </span>
    );
  }
  if (factor < 1) {
    return (
      <span className="shrink-0 font-black leading-none text-rose-400" style={{ textShadow: "0 0 3px #000" }} title="desventaja">
        ▼
      </span>
    );
  }
  return null;
}

/** HP / MP bar styled to match the FFVI panel: numeric readout on
 *  one line, bar below, tinted glow at the right edge. */
function StatBar({
  label,
  tone,
  value,
  max,
}: {
  label: string;
  tone: "hp" | "mp";
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  const barColor = tone === "hp" ? "bg-rose-400" : "bg-sky-300";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between text-[10px] tabular-nums">
        <span
          className={"font-bold uppercase tracking-widest " + (tone === "hp" ? "text-rose-200" : "text-sky-200")}
          style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
        >
          {label}
        </span>
        <span className="text-white" style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}>
          {value} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-black/40 ring-1 ring-white/20">
        <div className={"h-full transition-all duration-300 " + barColor} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Blinking pointing-glove cursor — FFVI signature. Stays visible
 *  next to the currently-selected action when it's the player's turn;
 *  goes invisible when the enemy is acting. */
function PointingGlove({ visible, blinking }: { visible: boolean; blinking: boolean }) {
  if (!visible) return <span className="inline-block w-4" />;
  return (
    <span
      className="inline-block w-4 text-amber-300"
      style={{
        animation: blinking ? "abyssCursorBlink 0.7s steps(2) infinite" : undefined,
      }}
    >
      <svg
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-4 w-4 drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)]"
        aria-hidden
      >
        {/* Stubby pointing hand silhouette, pixel-art friendly */}
        <path d="M3 4h1v1h1v1h1v1h1v1h7v1h-1v1h1v1h-1v1h-7v1h-1v-1h-1v-1h-1v-1h-1V8h-1V5h1V4z" />
      </svg>
      <style>{`
        @keyframes abyssCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
      `}</style>
    </span>
  );
}

/** Renders a character sprite + plays the state-appropriate frames.
 *
 *  Bulletproof stepper:
 *    - keeps frame index in a useRef so the interval callback always
 *      sees the latest counter without stale-closure problems
 *    - resets to frame 0 every time `state` changes
 *    - resolves frames lazily so falling back to idle when a state's
 *      frames don't exist is transparent
 */
function CharacterStage({
  baseSprite,
  atlas,
  facing,
  state,
  stateSuffix,
  flash,
  grayscale,
  flipFallback,
  staticIdle,
  debugLabel,
}: {
  baseSprite: string | null;
  atlas: Record<string, Record<string, string[]>> | null;
  facing: "east" | "west" | "south-east" | "south-west";
  state: AnimState;
  /** Optional suffix tagged onto the state key for per-weapon
   *  animations (e.g. attack + sword_2h → attack_sword_2h). Falls
   *  back to the unsuffixed key when the suffixed one is missing,
   *  so single-family chars (mobs) ignore this prop. */
  stateSuffix?: string;
  flash: boolean;
  grayscale: boolean;
  flipFallback?: boolean;
  /** When true, only show frame 0 of the idle anim (no loop). Other
   *  states still animate. User wanted mobs to stay still while idle
   *  so the attack reads as the main motion. */
  staticIdle?: boolean;
  debugLabel?: string;
}) {
  // Per-weapon key first (e.g. attack_axe_2h); fall back to the
  // generic state key (attack) which serves as the sword_1h default.
  const suffixedKey = stateSuffix ? `${state}_${stateSuffix}` : null;
  const directFrames =
    (suffixedKey ? atlas?.[suffixedKey]?.[facing] : null) ??
    atlas?.[state]?.[facing] ??
    null;
  // Fall back to idle frames when the state itself has none — keeps the
  // character visible while still animating in place. Idle also gets the
  // weapon-family suffix so mobs / weapon swaps keep their right look.
  const idleSuffixedKey = stateSuffix ? `idle_${stateSuffix}` : null;
  const fallbackFrames =
    (idleSuffixedKey ? atlas?.[idleSuffixedKey]?.[facing] : null) ??
    atlas?.idle?.[facing] ??
    null;
  const frames = directFrames ?? fallbackFrames ?? null;
  // staticIdle: pretend the idle loop is a single-frame array so the
  // interval below skips it entirely.
  const renderFrames = staticIdle && state === "idle" && frames ? [frames[0]!] : frames;
  const hint = ANIM_HINT[state];

  const [frameIdx, setFrameIdx] = useState(0);
  const frameIdxRef = useRef(0);

  // Reset to frame 0 every time the state changes so a swing always
  // starts from the wind-up frame.
  useEffect(() => {
    frameIdxRef.current = 0;
    setFrameIdx(0);
  }, [state]);

  useEffect(() => {
    if (!renderFrames || renderFrames.length <= 1) return;
    const intervalMs = Math.max(40, Math.round(1000 / hint.fps));
    const id = window.setInterval(() => {
      const last = renderFrames.length - 1;
      const cur = frameIdxRef.current;
      if (cur < last) {
        frameIdxRef.current = cur + 1;
        setFrameIdx(cur + 1);
      } else if (hint.loop) {
        frameIdxRef.current = 0;
        setFrameIdx(0);
      } else if (hint.hold) {
        // Stay on last frame; parent will change state to leave.
      } else {
        window.clearInterval(id);
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [frames, hint.fps, hint.loop, hint.hold]);

  const src =
    renderFrames && renderFrames.length > 0
      ? (renderFrames[Math.min(frameIdx, renderFrames.length - 1)] ?? baseSprite ?? "")
      : (baseSprite ?? "");
  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-rose-500/60 bg-abyss-coal/50 text-[10px] text-rose-300">
        {debugLabel ?? "no sprite"}
      </div>
    );
  }
  const transform = flipFallback ? "scaleX(-1)" : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={
        "h-full w-full object-contain transition-[filter] duration-150 " +
        (flash ? "brightness-200 " : "") +
        (grayscale ? "opacity-30 grayscale " : "")
      }
      style={{ imageRendering: "pixelated", transform }}
    />
  );
}

/** Flying arrow projectile — fires across the battlefield from
 *  the enemy cluster (left) to the player (right). Lifetime ~320ms
 *  matched to the playAppended impact-window sleep. The arrowhead
 *  trails a faint cyan glow to match the lizardman's nocked-arrow
 *  art. */
function ProjectileArrow() {
  return (
    <span
      className="pointer-events-none absolute top-1/2 z-10"
      style={{
        animation: "abyssArrowFly 320ms cubic-bezier(0.16, 0.84, 0.44, 1) forwards",
      }}
    >
      <svg viewBox="0 0 64 12" className="h-3 w-16 drop-shadow-[0_0_4px_rgba(103,232,249,0.85)]" aria-hidden>
        <line x1="0"  y1="6" x2="44" y2="6" stroke="#a78bfa" strokeWidth="2" />
        <polygon points="44,2 56,6 44,10" fill="#67e8f9" />
        <polygon points="0,2 6,6 0,10" fill="#a78bfa" />
      </svg>
    </span>
  );
}

/** One-shot slash burst overlay — rendered when a physical hit
 *  lands. Quick diagonal flash + bright streaks, lifetime ~380ms. */
function SlashBurst() {
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ animation: "abyssSlashBurst 380ms ease-out forwards" }}
    >
      <svg viewBox="0 0 100 100" className="h-3/4 w-3/4" aria-hidden>
        <defs>
          <linearGradient id="slashG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="40%" stopColor="white" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#fef3c7" stopOpacity="0.95" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g transform="rotate(-22 50 50)">
          <rect x="10" y="46" width="80" height="8" rx="4" fill="url(#slashG)" />
          <rect x="14" y="42" width="72" height="2" rx="1" fill="white" opacity="0.85" />
          <rect x="14" y="56" width="72" height="2" rx="1" fill="white" opacity="0.85" />
        </g>
      </svg>
      <style>{`
        @keyframes abyssSlashBurst {
          0%   { opacity: 0; transform: scale(0.6) rotate(-8deg); }
          25%  { opacity: 1; transform: scale(1.05) rotate(0deg); }
          70%  { opacity: 0.9; transform: scale(1.08) rotate(2deg); }
          100% { opacity: 0; transform: scale(1.1) rotate(4deg); }
        }
      `}</style>
    </span>
  );
}

function FloatingDamage({ value, variant }: { value: number | "MISS"; variant: "damage" | "miss" }) {
  return (
    <span
      className={
        "pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-3xl font-black " +
        (variant === "miss" ? "text-sky-300" : "text-amber-300")
      }
      style={{
        textShadow: "0 0 4px #000, 0 0 8px #000",
        animation: "abyssFloatUp 1.1s ease-out forwards",
      }}
    >
      {value === "MISS" ? "MISS" : `-${value}`}
      <style>{`
        @keyframes abyssFloatUp {
          0% { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, -60px); opacity: 0; }
        }
      `}</style>
    </span>
  );
}

function OutcomeCard({
  outcome,
  session,
  locale,
  onClose,
}: {
  outcome: "victory" | "defeat";
  session: CombatSession;
  locale: Locale;
  onClose: () => void;
}) {
  const victoryEntry = session.log_entries.find(
    (e) => e.kind === "victory",
  ) as Extract<CombatLogEntry, { kind: "victory" }> | undefined;
  const isVictory = outcome === "victory";
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className={
          "max-w-sm rounded-lg border-2 p-5 text-center shadow-2xl backdrop-blur " +
          (isVictory
            ? "border-amber-400 bg-abyss-deep/95"
            : "border-rose-500 bg-abyss-deep/95")
        }
      >
        <p
          className={
            "text-xs uppercase tracking-widest " +
            (isVictory ? "text-amber-400" : "text-rose-400")
          }
        >
          {t(locale, isVictory ? "combat.victory_title" : "combat.defeat_title")}
        </p>
        <p className="mt-2 text-lg font-bold text-white">
          {isVictory
            ? t(locale, "combat.victory_body", { exp: victoryEntry?.exp_awarded ?? 0, khryn: victoryEntry?.khryn_awarded ?? 0 })
            : t(locale, "combat.defeat_body")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className={
            "mt-4 w-full rounded px-3 py-2 text-xs font-bold uppercase tracking-widest text-abyss-void " +
            (isVictory ? "bg-amber-400 hover:bg-amber-300" : "bg-rose-500 hover:bg-rose-400")
          }
        >
          {t(locale, isVictory ? "combat.continue" : "combat.respawn")}
        </button>
      </div>
    </div>
  );
}
