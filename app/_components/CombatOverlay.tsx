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
 * Phase 4d combat overlay — side-view battle in the FF VI / Octopath
 * tradition. Each entity (player + each alive mob) is rendered through
 * <CharacterStage> which knows how to:
 *   - loop the idle (breathing) frames forever
 *   - play one-shot animations (attack, skill, hurt, dodge, block) and
 *     return to idle when done
 *   - hold terminal animations (death, victory) on the last frame
 *
 * After every /combat/action response the parent walks the appended
 * log entries (attack, miss, stance, death, victory, defeat) and
 * SCHEDULES the matching state transition per entity, then plays back
 * in real time so the player sees the swing connect, the target flinch,
 * mobs counter, etc.
 *
 * Server is authoritative: dmg / hp / dodge roll all come pre-decided
 * in `appended`; this component only animates them.
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

/** Per-state hint that drives <CharacterStage> playback. */
const ANIM_HINT: Record<AnimState, { fps: number; loop: boolean; hold: boolean }> = {
  idle:    { fps: 6,  loop: true,  hold: false },
  attack:  { fps: 14, loop: false, hold: false },
  skill:   { fps: 12, loop: false, hold: false },
  hurt:    { fps: 14, loop: false, hold: false },
  dodge:   { fps: 16, loop: false, hold: false },
  block:   { fps: 10, loop: false, hold: true  },
  death:   { fps: 10, loop: false, hold: true  },
  victory: { fps: 8,  loop: true,  hold: false },
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
  /** True between the user tap and the end of the log-entry playback —
   *  blocks new actions while the cinema plays. */
  const [playing, setPlaying] = useState(false);
  /** Per-entity animation state. Key: 'player' | 'mob:0' | 'mob:1' …
   *  Drives <CharacterStage>. */
  const [animStates, setAnimStates] = useState<Record<string, AnimState>>(() => {
    const s: Record<string, AnimState> = { player: "idle" };
    initialSession.mobs.forEach((_, i) => { s[`mob:${i}`] = "idle"; });
    return s;
  });

  const currentTurn: CombatTurn =
    session.turn_order[session.turn_idx % session.turn_order.length] ?? { kind: "player" };

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

  /** Play back the server-resolved log entries one by one with the
   *  right timing so the user actually sees the attack frames + the
   *  target reaction. */
  async function playAppended(appended: CombatLogEntry[]) {
    setPlaying(true);
    for (const entry of appended) {
      if (entry.kind === "attack") {
        const isSkill = entry.action_kind === "skill" && entry.actor === "player";
        const actorState: AnimState = isSkill ? "skill" : "attack";
        const actorDurMs = Math.round(1000 * (isSkill ? 8 : 6) / ANIM_HINT[actorState].fps);
        setEntityAnim(entry.actor, actorState);
        // Reaction lands ~halfway through the swing.
        await sleep(Math.round(actorDurMs * 0.45));
        setEntityAnim(entry.target, "hurt");
        flashEntity(entry.target);
        pushFloat(entry.target, entry.dmg, "damage");
        await sleep(Math.round(actorDurMs * 0.55) + 250);
        // Return to idle unless the target just died (death entry will
        // override below).
        setAnimStates((prev) => ({
          ...prev,
          [entry.actor]: prev[entry.actor] === "death" ? "death" : "idle",
          [entry.target]: prev[entry.target] === "death" ? "death" : "idle",
        }));
      } else if (entry.kind === "miss") {
        // Mob attacked, player dodged. Mob plays attack; player plays
        // dodge alongside; no damage number, just "MISS".
        setEntityAnim(entry.actor, "attack");
        await sleep(150);
        setEntityAnim(entry.target, "dodge");
        pushFloat(entry.target, "MISS", "miss");
        await sleep(550);
        setAnimStates((prev) => ({
          ...prev,
          [entry.actor]: prev[entry.actor] === "death" ? "death" : "idle",
          [entry.target]: prev[entry.target] === "death" ? "death" : "idle",
        }));
      } else if (entry.kind === "stance") {
        // Player chose defend/dodge — hold the corresponding pose
        // until the mob counter sequence finishes (next idle reset).
        if (entry.mode === "defending") {
          setEntityAnim("player", "block");
        } else {
          // For dodge stance we'll show the actual dodge inline with
          // each incoming attack (miss entries above). Stay on idle.
          setEntityAnim("player", "idle");
        }
        await sleep(250);
      } else if (entry.kind === "death") {
        setEntityAnim(entry.actor, "death");
        await sleep(500);
      } else if (entry.kind === "victory") {
        setEntityAnim("player", "victory");
        await sleep(400);
      } else if (entry.kind === "defeat") {
        setEntityAnim("player", "death");
        await sleep(500);
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

  const recentLog = useMemo(() => {
    const all = session.log_entries.slice(-6);
    return all.map((e) => formatLogEntry(e, locale, session.mobs, mobs));
  }, [session.log_entries, session.mobs, locale, mobs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-abyss-void text-white">
      {/* Backdrop — cinematic scene rendered FULL-SIZE with smooth
          scaling so the painted detail stays readable. */}
      <div className="pointer-events-none absolute inset-0">
        {backdropUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backdropUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: "brightness(0.72) saturate(0.95)" }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-abyss-void/35 via-abyss-deep/40 to-abyss-coal/75" />
      </div>

      {/* Battlefield: enemies LEFT (large, grouped), player RIGHT (large).
          Both anchored to a shared baseline so they read as standing
          on the same ground line. */}
      <div className="relative flex-1">
        <div className="absolute inset-x-0 bottom-2 top-10 flex items-end justify-between gap-4 px-4">
          {/* LEFT — enemy lineup */}
          <div className="flex flex-1 items-end justify-around gap-1 pb-2">
            {session.mobs.map((m, idx) => {
              const mobMeta = mobs[idx];
              const key = `mob:${idx}`;
              const state = animStates[key] ?? "idle";
              const isHit = hitFlash.has(key);
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
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div className="relative h-52 w-52 sm:h-56 sm:w-56">
                    <CharacterStage
                      baseSprite={baseSprite}
                      atlas={atlas}
                      facing="east"
                      state={state}
                      flash={isHit}
                      grayscale={!m.alive}
                      debugLabel={m.name}
                    />
                    {floats
                      .filter((f) => f.target === key)
                      .map((f) => (
                        <FloatingDamage key={f.id} value={f.value} variant={f.variant} />
                      ))}
                  </div>
                  <EntityBar
                    label={mobMeta?.name_localized ?? m.name}
                    hp={m.hp}
                    hpMax={m.max_hp}
                    mp={null}
                    mpMax={null}
                    isCurrentActor={currentTurn.kind === "mob" && currentTurn.idx === idx}
                  />
                </div>
              );
            })}
          </div>

          {/* RIGHT — player */}
          <div className="flex flex-1 items-end justify-around pb-2">
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-56 w-56 sm:h-64 sm:w-64">
                {(() => {
                  // Player sprite resolution priority:
                  //   1. combat_sprite_atlas.west (proper side-view)
                  //   2. combat_sprite_atlas.east flipped
                  //   3. top-down south flipped (last-ditch)
                  const csWest = player.combat_sprite_atlas?.west ?? null;
                  const csEast = player.combat_sprite_atlas?.east ?? null;
                  const topSouth = player.sprite_atlas?.south ?? null;
                  const baseSprite = csWest ?? csEast ?? topSouth ?? null;
                  // If atlas has the WEST frames use them; if only east
                  // frames exist, the combat_animation_atlas is keyed
                  // east — we flip CSS for the player slot. Otherwise
                  // fall back to top-down animation_atlas.idle.south
                  // (still better than a static frame).
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
              <EntityBar
                label={player.name}
                hp={session.player_hp}
                hpMax={session.player_max_hp}
                mp={player.mp_current}
                mpMax={player.mp_max_effective}
                isCurrentActor={currentTurn.kind === "player" && !session.is_over}
              />
              <p className="text-[10px] uppercase tracking-widest text-abyss-fog">
                Nv.{player.level} · {player.class_name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Combat log strip */}
      <div className="relative border-t border-abyss-coal/80 bg-abyss-void/85 px-3 py-2 backdrop-blur">
        <div className="max-h-16 overflow-y-auto text-[10px] leading-tight">
          {recentLog.length === 0 ? (
            <p className="text-abyss-fog/70 italic">{t(locale, "combat.log_empty")}</p>
          ) : (
            recentLog.map((line, i) => (
              <p key={i} className={line.tone}>{line.text}</p>
            ))
          )}
        </div>
      </div>

      {/* Action menu — 4 actions per the user's extended set. */}
      {!session.is_over ? (
        <div className="relative border-t-2 border-abyss-soul/60 bg-abyss-deep/95 px-3 py-3 backdrop-blur">
          <div className="grid grid-cols-4 gap-2">
            <ActionButton
              label={t(locale, "combat.action_attack")}
              color="amber"
              disabled={busy || playing || currentTurn.kind !== "player" || defaultTargetIdx < 0}
              onClick={() => handleAction("attack", defaultTargetIdx)}
            />
            <ActionButton
              label={t(locale, "combat.action_skill")}
              color="violet"
              disabled={busy || playing || currentTurn.kind !== "player" || defaultTargetIdx < 0}
              onClick={() => handleAction("skill", defaultTargetIdx)}
            />
            <ActionButton
              label={t(locale, "combat.action_defend")}
              color="sky"
              disabled={busy || playing || currentTurn.kind !== "player"}
              onClick={() => handleAction("defend")}
            />
            <ActionButton
              label={t(locale, "combat.action_dodge")}
              color="emerald"
              disabled={busy || playing || currentTurn.kind !== "player"}
              onClick={() => handleAction("dodge")}
            />
          </div>
          {session.mobs.filter((m) => m.alive).length > 1 ? (
            <div className="mt-2 flex gap-2">
              {session.mobs.map((m, idx) =>
                m.alive ? (
                  <button
                    key={idx}
                    type="button"
                    disabled={busy || playing || currentTurn.kind !== "player"}
                    onClick={() => handleAction("attack", idx)}
                    className="flex-1 rounded border border-abyss-soul/60 bg-abyss-coal/80 px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-abyss-soul/20 disabled:opacity-40"
                  >
                    → {mobs[idx]?.name_localized ?? m.name}
                  </button>
                ) : null,
              )}
            </div>
          ) : null}
          <div className="mt-1 text-center text-[10px] text-abyss-fog">
            {playing
              ? t(locale, "combat.resolving")
              : currentTurn.kind === "player"
                ? t(locale, "combat.your_turn")
                : t(locale, "combat.enemy_turn")}
          </div>
          {error ? (
            <p className="mt-2 text-center text-[10px] text-rose-400">{error}</p>
          ) : null}
        </div>
      ) : null}

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

/** Action button with a single-color theme (used in the 4-button row). */
function ActionButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: "amber" | "violet" | "sky" | "emerald";
  disabled: boolean;
  onClick: () => void;
}) {
  const bg: Record<typeof color, string> = {
    amber:   "bg-amber-500/90 hover:bg-amber-500 text-abyss-void",
    violet:  "bg-violet-500/90 hover:bg-violet-500 text-white",
    sky:     "bg-sky-500/90 hover:bg-sky-500 text-white",
    emerald: "bg-emerald-500/90 hover:bg-emerald-500 text-abyss-void",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-2.5 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40 ${bg[color]}`}
    >
      {label}
    </button>
  );
}

/**
 * Renders a character sprite + plays the state-appropriate animation.
 * Loop states cycle forever; one-shot states run their frames once and
 * the parent flips the state back to 'idle' afterward. Hold states
 * (death, block) stay on the last frame until parent changes state.
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
  /** Set true when baseSprite is a top-down rotation and we need to
   *  flip it horizontally so the character faces toward the centre. */
  flipFallback?: boolean;
  /** Shown as a placeholder if no sprite resolved — helps QA spot
   *  data-flow regressions like "atlas missing in DB". */
  debugLabel?: string;
}) {
  const stateFrames = atlas?.[state]?.[facing] ?? null;
  // For one-shot states (attack / hurt / dodge etc.) fall back to the
  // idle frames so the character is never invisible when only idle is
  // populated. This was the previous regression — picking a state
  // whose key wasn't in the atlas gave null frames → null src → empty box.
  const idleFrames = atlas?.idle?.[facing] ?? null;
  const playFrames = stateFrames ?? idleFrames ?? null;
  const hint = ANIM_HINT[state];
  const [frameIdx, setFrameIdx] = useState(0);

  // Reset to frame 0 when state changes.
  useEffect(() => {
    setFrameIdx(0);
  }, [state]);

  useEffect(() => {
    if (!playFrames || playFrames.length <= 1) return;
    let cancelled = false;
    let i = 0;
    const interval = window.setInterval(() => {
      if (cancelled) return;
      const last = playFrames.length - 1;
      if (i < last) {
        i += 1;
        setFrameIdx(i);
      } else if (hint.loop) {
        i = 0;
        setFrameIdx(0);
      } else if (hint.hold) {
        // Stay on last frame.
      } else {
        // One-shot finished; parent will transition us back to idle.
        window.clearInterval(interval);
      }
    }, Math.max(40, Math.round(1000 / hint.fps)));
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [playFrames, hint.fps, hint.loop, hint.hold]);

  const src =
    playFrames && playFrames.length > 0
      ? (playFrames[Math.min(frameIdx, playFrames.length - 1)] ?? baseSprite ?? "")
      : (baseSprite ?? "");
  if (!src) {
    // Defensive fallback so QA can see WHERE the character would be
    // even when the assets failed to populate. Won't normally render.
    return (
      <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-rose-500/60 bg-abyss-coal/50 text-[10px] text-rose-300">
        {debugLabel ?? "no sprite"}
      </div>
    );
  }
  const transforms: string[] = [];
  if (flipFallback) transforms.push("scaleX(-1)");
  const transform = transforms.length > 0 ? transforms.join(" ") : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={
        "h-full w-full object-contain transition-[filter,transform] duration-150 " +
        (flash ? "brightness-200 " : "") +
        (grayscale ? "opacity-30 grayscale " : "")
      }
      style={{ imageRendering: "pixelated", transform }}
    />
  );
}

/** HP (red) + optional MP (cyan) bars + name + current-actor ring. */
function EntityBar({
  label,
  hp,
  hpMax,
  mp,
  mpMax,
  isCurrentActor,
}: {
  label: string;
  hp: number;
  hpMax: number;
  mp: number | null;
  mpMax: number | null;
  isCurrentActor: boolean;
}) {
  const hpPct = hpMax > 0 ? Math.max(0, (hp / hpMax) * 100) : 0;
  const mpPct = mp !== null && mpMax !== null && mpMax > 0
    ? Math.max(0, (mp / mpMax) * 100)
    : 0;
  return (
    <div
      className={
        "w-44 rounded border bg-abyss-void/80 px-1.5 py-1 backdrop-blur " +
        (isCurrentActor ? "border-amber-400 ring-1 ring-amber-400/60" : "border-abyss-coal/70")
      }
    >
      <p className="truncate text-[11px] font-semibold text-white">{label}</p>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="w-5 text-[8px] uppercase tracking-widest text-rose-300">PV</span>
        <div className="flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded bg-abyss-coal/70">
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
        <span className="min-w-[44px] text-right text-[9px] tabular-nums text-abyss-fog">
          {hp}/{hpMax}
        </span>
      </div>
      {mp !== null && mpMax !== null ? (
        <div className="mt-0.5 flex items-center gap-1">
          <span className="w-5 text-[8px] uppercase tracking-widest text-sky-300">PM</span>
          <div className="flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded bg-abyss-coal/70">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${mpPct}%` }}
              />
            </div>
          </div>
          <span className="min-w-[44px] text-right text-[9px] tabular-nums text-abyss-fog">
            {mp}/{mpMax}
          </span>
        </div>
      ) : null}
    </div>
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

function formatLogEntry(
  entry: CombatLogEntry,
  locale: Locale,
  mobs: { id: string; name: string }[],
  encounterMobs: { name_localized: string }[],
): { text: string; tone: string } {
  function actorName(actor: string): string {
    if (actor === "player") return t(locale, "combat.actor_you");
    const m = actor.match(/^mob:(\d+)$/);
    if (m) {
      const idx = Number(m[1]);
      return encounterMobs[idx]?.name_localized ?? mobs[idx]?.name ?? actor;
    }
    return actor;
  }
  switch (entry.kind) {
    case "attack": {
      const actor = actorName(entry.actor);
      const target = actorName(entry.target);
      const tone = entry.actor === "player" ? "text-amber-200" : "text-rose-300";
      const key = entry.action_kind === "skill" ? "combat.log_skill" : "combat.log_attack";
      return {
        text: t(locale, key, { actor, target, dmg: entry.dmg }),
        tone,
      };
    }
    case "miss":
      return {
        text: t(locale, "combat.log_miss", { actor: actorName(entry.actor), target: actorName(entry.target) }),
        tone: "text-sky-300",
      };
    case "stance":
      return {
        text: t(locale, entry.mode === "defending" ? "combat.log_defend" : "combat.log_dodge_ready"),
        tone: "text-emerald-300 italic",
      };
    case "death":
      return {
        text: t(locale, "combat.log_death", { actor: actorName(entry.actor) }),
        tone: "text-abyss-fog italic",
      };
    case "victory":
      return {
        text: t(locale, "combat.log_victory", { exp: entry.exp_awarded, khryn: entry.khryn_awarded }),
        tone: "text-amber-300 font-bold",
      };
    case "defeat":
      return { text: t(locale, "combat.log_defeat"), tone: "text-rose-400 font-bold" };
  }
}
