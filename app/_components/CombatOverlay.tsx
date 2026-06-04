"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { t, type Locale } from "@/lib/i18n";
import type {
  CombatLogEntry,
  CombatSession,
  CombatTurn,
  EncounterMob,
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
  | "attack"
  | "skill"
  | "hurt"
  | "dodge"
  | "block"
  | "death"
  | "victory";

const ANIM_HINT: Record<AnimState, { fps: number; loop: boolean; hold: boolean }> = {
  idle:    { fps: 6,  loop: true,  hold: false },
  attack:  { fps: 10, loop: false, hold: false },
  skill:   { fps: 10, loop: false, hold: false },
  hurt:    { fps: 12, loop: false, hold: false },
  dodge:   { fps: 14, loop: false, hold: false },
  block:   { fps: 8,  loop: false, hold: true  },
  death:   { fps: 8,  loop: false, hold: true  },
  victory: { fps: 6,  loop: true,  hold: false },
};

const ACTIONS: { kind: PlayerActionKind; labelKey: string; needsTarget: boolean }[] = [
  { kind: "attack", labelKey: "combat.action_attack", needsTarget: true  },
  { kind: "skill",  labelKey: "combat.action_skill",  needsTarget: true  },
  { kind: "defend", labelKey: "combat.action_defend", needsTarget: false },
  { kind: "dodge",  labelKey: "combat.action_dodge",  needsTarget: false },
];

/** Per-mob horizontal flip when a generation's east rotation reads
 *  mirrored. The v2 PixelLab art generated for centaur + lizardman
 *  faces RIGHT naturally so no flip needed; the map is kept as a
 *  hook for future mobs whose generated east still reads wrong. */
const MOB_SPRITE_FLIP: Record<string, boolean> = {
  // centaur_warrior: false (v2 sprite faces right correctly)
};

type Props = {
  locale: Locale;
  session: CombatSession;
  player: RoomState["player"];
  mobs: EncounterMob[];
  backdropUrl: string | null;
  onAction: (
    action: PlayerActionKind,
    targetMobIdx?: number,
  ) => Promise<{ nextSession: CombatSession; appended: CombatLogEntry[] }>;
  onClose: (outcome: "victory" | "defeat") => void;
};

const HIT_FLASH_MS = 320;
const FLOAT_LIFETIME_MS = 1100;

export function CombatOverlay({
  locale,
  session: initialSession,
  player,
  mobs,
  backdropUrl,
  onAction,
  onClose,
}: Props) {
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

  /** Walk through the server-resolved log entries and animate them
   *  one-by-one so the user actually SEES the swing connect + the
   *  target flinch. */
  async function playAppended(appended: CombatLogEntry[]) {
    setPlaying(true);
    for (const entry of appended) {
      if (entry.kind === "attack") {
        const isSkill = entry.action_kind === "skill" && entry.actor === "player";
        const actorState: AnimState = isSkill ? "skill" : "attack";
        // Hold the attack pose for a beat over the full frame count
        // so the user clearly registers the swing.
        const frameCount = isSkill ? 8 : 6;
        const actorDurMs = Math.round((frameCount / ANIM_HINT[actorState].fps) * 1000);
        setEntityAnim(entry.actor, actorState);
        // Pre-impact pause so we can SEE the wind-up.
        await sleep(Math.round(actorDurMs * 0.55));
        setEntityAnim(entry.target, "hurt");
        flashEntity(entry.target);
        pushFloat(entry.target, entry.dmg, "damage");
        // Hold the connect + flinch beat.
        await sleep(Math.round(actorDurMs * 0.45) + 350);
        setAnimStates((prev) => ({
          ...prev,
          [entry.actor]:  prev[entry.actor]  === "death" ? "death" : "idle",
          [entry.target]: prev[entry.target] === "death" ? "death" : "idle",
        }));
        await sleep(120);
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
        setEntityAnim(entry.actor, "death");
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
              animStates={animStates}
              hitFlash={hitFlash}
              floats={floats}
              targetPickerIdx={targetPicker?.targetIdx ?? null}
              onPickTarget={(idx) => {
                if (targetPicker && session.mobs[idx]?.alive) {
                  setTargetPicker({ ...targetPicker, targetIdx: idx });
                }
              }}
            />
          </div>

          {/* Player — centered. */}
          <div className="flex items-center justify-center">
            <div className="relative aspect-square w-full max-w-[260px]">
              {(() => {
                const csWest = player.combat_sprite_atlas?.west ?? null;
                const csEast = player.combat_sprite_atlas?.east ?? null;
                const topSouth = player.sprite_atlas?.south ?? null;
                const baseSprite = csWest ?? csEast ?? topSouth ?? null;
                const combatAtlasHasWest = !!player.combat_animation_atlas?.idle?.west;
                const facing: "east" | "west" = combatAtlasHasWest ? "west" : "east";
                const flip = !combatAtlasHasWest && (!!csEast || !!topSouth || !!player.combat_animation_atlas);
                return (
                  <CharacterStage
                    baseSprite={baseSprite}
                    atlas={player.combat_animation_atlas ?? player.animation_atlas ?? null}
                    facing={facing}
                    flipFallback={flip}
                    state={animStates["player"] ?? "idle"}
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
            </div>
          </div>
        </div>
      </div>

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
              className="-mt-1 text-[10px] uppercase tracking-widest text-sky-200"
              style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.7)" }}
            >
              {player.class_name}
            </p>
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
  animStates,
  hitFlash,
  floats,
  targetPickerIdx,
  onPickTarget,
}: {
  mobs: CombatSession["mobs"];
  encounterMobs: EncounterMob[];
  animStates: Record<string, AnimState>;
  hitFlash: Set<string>;
  floats: FloatingNumber[];
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
              const baseSprite =
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
                    (isFocused ? "scale-[1.05]" : "")
                  }
                  style={{ transform: `translateY(${offset * 18}px)` }}
                >
                  <div
                    className={
                      "relative aspect-square w-full max-w-[180px] " +
                      (isFocused ? "drop-shadow-[0_0_8px_rgba(252,211,77,0.85)]" : "")
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
                      facing="east"
                      state={state}
                      flash={isHit}
                      grayscale={!m.alive}
                      flipFallback={MOB_SPRITE_FLIP[m.id] ?? false}
                      debugLabel={m.name}
                    />
                    {floats
                      .filter((f) => f.target === key)
                      .map((f) => (
                        <FloatingDamage key={f.id} value={f.value} variant={f.variant} />
                      ))}
                  </div>
                  <div className="w-full max-w-[150px]">
                    <div className="flex items-baseline justify-between text-[9px] font-semibold text-white drop-shadow">
                      <span className="truncate">{mobMeta?.name_localized ?? m.name}</span>
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
  flash,
  grayscale,
  flipFallback,
  debugLabel,
}: {
  baseSprite: string | null;
  atlas: Record<string, Record<string, string[]>> | null;
  facing: "east" | "west";
  state: AnimState;
  flash: boolean;
  grayscale: boolean;
  flipFallback?: boolean;
  debugLabel?: string;
}) {
  const directFrames = atlas?.[state]?.[facing] ?? null;
  // Fall back to idle frames when the state itself has none — keeps the
  // character visible while still animating in place.
  const fallbackFrames = atlas?.idle?.[facing] ?? null;
  const frames = directFrames ?? fallbackFrames ?? null;
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
    if (!frames || frames.length <= 1) return;
    const intervalMs = Math.max(40, Math.round(1000 / hint.fps));
    const id = window.setInterval(() => {
      const last = frames.length - 1;
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
    frames && frames.length > 0
      ? (frames[Math.min(frameIdx, frames.length - 1)] ?? baseSprite ?? "")
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
