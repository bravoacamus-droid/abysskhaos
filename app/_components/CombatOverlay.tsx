"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { t, type Locale } from "@/lib/i18n";
import type {
  CombatLogEntry,
  CombatSession,
  CombatTurn,
  EncounterMob,
  RoomState,
} from "@/lib/client/api";

/**
 * Phase 4b side-view combat overlay (FF VI / Chrono Trigger / Octopath
 * inspired). Full-screen React component.
 *
 * Layout: enemies LEFT row, player RIGHT — horizontal facing-each-other
 * just like the references. Backdrop is a darkened blurred image of the
 * current room biome (cave) so the combat reads as "in the world", not
 * "on a blank screen".
 *
 * Sprites: enemies use east-facing rotation (looking right toward the
 * player); player uses south-facing flipped horizontally (warrior
 * standing tall, weapon-side toward enemies). All idle sprites that
 * have a `breathing-idle` animation atlas registered loop it; combat
 * actions trigger a transient flash + position shake + floating
 * damage number for now. The PixelLab attack-animation frames land
 * in a follow-up commit.
 *
 * HUD: HP red bar + MP cyan bar per entity; current actor gets a
 * subtle gold ring. Combat log strip at the bottom (last 6 lines);
 * action menu pinned bottom-right.
 *
 * Server is authoritative — see lib/server/combat.ts; this component
 * only POSTs intents via onAttack(idx) and animates whatever entries
 * come back in `appended`.
 */

type FloatingNumber = {
  id: number;
  /** "player" or "mob:idx" */
  target: string;
  value: number;
  variant: "damage" | "miss";
};

type Props = {
  locale: Locale;
  /** Server-authoritative session state. */
  session: CombatSession;
  /** Player's sprite atlas + vitals for the right-side party panel. */
  player: RoomState["player"];
  /** Enriched mob metadata for the upper UI (names already localized
   *  + animation_atlas references). */
  mobs: EncounterMob[];
  /** Optional URL of a backdrop image (room's biome tile, blurred via
   *  CSS). Falls back to the dark gradient when null. */
  backdropUrl: string | null;
  /** Submitted by the user — UI is disabled until resolved. */
  onAttack: (targetMobIdx: number) => Promise<{
    nextSession: CombatSession;
    appended: CombatLogEntry[];
  }>;
  /** Fired after the player taps "Continue" on the victory / defeat
   *  card so the parent can fade the overlay + reload room state. */
  onClose: (outcome: "victory" | "defeat") => void;
};

const HIT_FLASH_MS = 320;
const FLOAT_LIFETIME_MS = 1000;

export function CombatOverlay({
  locale,
  session: initialSession,
  player,
  mobs,
  backdropUrl,
  onAttack,
  onClose,
}: Props) {
  const [session, setSession] = useState<CombatSession>(initialSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitFlash, setHitFlash] = useState<Set<string>>(new Set());
  const [attackFlash, setAttackFlash] = useState<Set<string>>(new Set());
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const floatIdRef = useRef(1);
  const [showOutcomeCard, setShowOutcomeCard] = useState(initialSession.is_over);

  const currentTurn: CombatTurn =
    session.turn_order[session.turn_idx % session.turn_order.length] ?? { kind: "player" };

  /** Trigger flash + floating-number animations for log entries that
   *  just arrived. Called every time the server response comes back. */
  function animateAppended(appended: CombatLogEntry[]) {
    const targetFlashKeys = new Set<string>();
    const attackerFlashKeys = new Set<string>();
    const newFloats: FloatingNumber[] = [];
    for (const entry of appended) {
      if (entry.kind === "attack") {
        targetFlashKeys.add(entry.target);
        attackerFlashKeys.add(entry.actor);
        newFloats.push({
          id: floatIdRef.current++,
          target: entry.target,
          value: entry.dmg,
          variant: "damage",
        });
      }
    }
    if (targetFlashKeys.size > 0) {
      setHitFlash((prev) => new Set([...prev, ...targetFlashKeys]));
      window.setTimeout(() => {
        setHitFlash((prev) => {
          const next = new Set(prev);
          for (const k of targetFlashKeys) next.delete(k);
          return next;
        });
      }, HIT_FLASH_MS);
    }
    if (attackerFlashKeys.size > 0) {
      setAttackFlash((prev) => new Set([...prev, ...attackerFlashKeys]));
      window.setTimeout(() => {
        setAttackFlash((prev) => {
          const next = new Set(prev);
          for (const k of attackerFlashKeys) next.delete(k);
          return next;
        });
      }, HIT_FLASH_MS);
    }
    if (newFloats.length > 0) {
      setFloats((prev) => [...prev, ...newFloats]);
      const ids = newFloats.map((f) => f.id);
      window.setTimeout(() => {
        setFloats((prev) => prev.filter((f) => !ids.includes(f.id)));
      }, FLOAT_LIFETIME_MS);
    }
  }

  async function handleAttack(targetIdx: number) {
    if (busy || session.is_over) return;
    setBusy(true);
    setError(null);
    try {
      const { nextSession, appended } = await onAttack(targetIdx);
      animateAppended(appended);
      setSession(nextSession);
      if (nextSession.is_over) {
        window.setTimeout(() => setShowOutcomeCard(true), 800);
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
      {/* Backdrop — either a cinematic scene (from the encounter
          prop's combat_backdrop_url) or a tiled wall texture as
          fallback. Cinematic gets a gentle darkening tint only;
          tiled fallback gets a stronger blur because it's not meant
          to be looked at directly. */}
      <div className="pointer-events-none absolute inset-0">
        {backdropUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backdropUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: "brightness(0.7) saturate(0.9)", imageRendering: "pixelated" }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-abyss-void/35 via-abyss-deep/45 to-abyss-coal/70" />
      </div>

      {/* Battlefield: enemies LEFT (facing east), player RIGHT
          (facing west, sprite flipped). Both anchored to the bottom
          half so the action menu / log don't overlap them. */}
      <div className="relative flex-1">
        <div className="absolute inset-x-0 bottom-0 top-12 flex items-end">
          {/* LEFT — enemy lineup */}
          <div className="flex flex-1 items-end justify-around gap-2 pb-6 pl-4">
            {session.mobs.map((m, idx) => {
              const mobMeta = mobs[idx];
              const targetKey = `mob:${idx}`;
              const isHit = hitFlash.has(targetKey);
              const isAttacker = attackFlash.has(targetKey);
              // Prefer SIDE-VIEW combat sprite first (Phase 4c art);
              // fall back to top-down rotation if a mob hasn't had the
              // combat art pass yet.
              const sprite =
                m.combat_sprite_atlas?.east ??
                mobMeta?.combat_sprite_atlas?.east ??
                m.combat_sprite_atlas?.west ??
                mobMeta?.combat_sprite_atlas?.west ??
                m.sprite_atlas?.east ??
                mobMeta?.sprite_atlas?.east ??
                m.sprite_atlas?.south ??
                mobMeta?.sprite_atlas?.south ??
                null;
              const idleFrames =
                m.combat_animation_atlas?.idle?.east ??
                mobMeta?.combat_animation_atlas?.idle?.east ??
                m.animation_atlas?.idle?.east ??
                mobMeta?.animation_atlas?.idle?.east ??
                null;
              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div className="relative h-32 w-32">
                    {sprite || idleFrames ? (
                      <FrameLoop
                        idleFrames={idleFrames}
                        fallbackUrl={sprite}
                        alt={m.name}
                        className={
                          "h-full w-full object-contain transition-transform duration-200 " +
                          (m.alive ? "" : "opacity-30 grayscale ") +
                          (isHit ? "translate-x-1 brightness-200 " : "") +
                          (isAttacker ? "-translate-x-2 " : "")
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded border border-abyss-coal bg-abyss-coal/60 text-center text-[10px] text-abyss-fog">
                        {m.name}
                      </div>
                    )}
                    {floats
                      .filter((f) => f.target === targetKey)
                      .map((f) => (
                        <FloatingDamage key={f.id} value={f.value} />
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
          <div className="flex flex-1 items-end justify-around pb-6 pr-4">
            <div className="flex flex-col items-center gap-1">
              <div className="relative h-36 w-36">
                {(() => {
                  // Prefer side-view combat sprite. Player faces WEST
                  // (toward enemies on the left), so use west variant
                  // if present; else east flipped horizontally; else
                  // the top-down south sprite flipped (last fallback).
                  const combatWest = player.combat_sprite_atlas?.west ?? null;
                  const combatEast = player.combat_sprite_atlas?.east ?? null;
                  const topDown = player.sprite_atlas?.south ?? null;
                  const src = combatWest ?? combatEast ?? topDown;
                  if (!src) return null;
                  const shouldFlip = !combatWest && (!!combatEast || !!topDown);
                  // Prefer combat idle frames; fall back to top-down idle.
                  const idleFrames =
                    player.combat_animation_atlas?.idle?.west ??
                    player.combat_animation_atlas?.idle?.east ??
                    player.animation_atlas?.idle?.south ??
                    null;
                  return (
                    <FrameLoop
                      idleFrames={idleFrames}
                      fallbackUrl={src}
                      alt={player.name}
                      className={
                        "h-full w-full object-contain transition-transform duration-200 " +
                        (hitFlash.has("player") ? "-translate-x-1 brightness-200 " : "") +
                        (attackFlash.has("player") ? "translate-x-2 " : "")
                      }
                      flipHorizontal={shouldFlip}
                    />
                  );
                })()}
                {floats
                  .filter((f) => f.target === "player")
                  .map((f) => (
                    <FloatingDamage key={f.id} value={f.value} />
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

      {/* Action menu */}
      {!session.is_over ? (
        <div className="relative border-t-2 border-abyss-soul/60 bg-abyss-deep/95 px-3 py-3 backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || currentTurn.kind !== "player" || defaultTargetIdx < 0}
              onClick={() => handleAttack(defaultTargetIdx)}
              className="rounded bg-abyss-ember/90 px-3 py-2.5 text-sm font-bold uppercase tracking-widest text-abyss-void hover:bg-abyss-ember disabled:opacity-40"
            >
              {t(locale, "combat.action_attack")}
            </button>
            <div className="flex items-center justify-center text-[11px] text-abyss-fog">
              {busy
                ? t(locale, "combat.resolving")
                : currentTurn.kind === "player"
                  ? t(locale, "combat.your_turn")
                  : t(locale, "combat.enemy_turn")}
            </div>
          </div>
          {session.mobs.filter((m) => m.alive).length > 1 ? (
            <div className="mt-2 flex gap-2">
              {session.mobs.map((m, idx) =>
                m.alive ? (
                  <button
                    key={idx}
                    type="button"
                    disabled={busy || currentTurn.kind !== "player"}
                    onClick={() => handleAttack(idx)}
                    className="flex-1 rounded border border-abyss-soul/60 bg-abyss-coal/80 px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-abyss-soul/20 disabled:opacity-40"
                  >
                    → {mobs[idx]?.name_localized ?? m.name}
                  </button>
                ) : null,
              )}
            </div>
          ) : null}
          {error ? (
            <p className="mt-2 text-[10px] text-rose-400">{error}</p>
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
        "w-36 rounded border bg-abyss-void/80 px-1.5 py-1 backdrop-blur " +
        (isCurrentActor ? "border-amber-400 ring-1 ring-amber-400/60" : "border-abyss-coal/70")
      }
    >
      <p className="truncate text-[10px] font-semibold text-white">{label}</p>
      {/* HP bar (red — canonical color the user requested) */}
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
      {/* MP bar — cyan; shown for player only (mob has no MP stat yet). */}
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

/** Tiny frame-loop player: if `idleFrames` is non-empty, cycles
 *  through them at ~6fps for a breathing-idle loop. Otherwise just
 *  shows `fallbackUrl` as a static <img>. We don't reach for Phaser
 *  here since the combat overlay is HTML/CSS for portability. */
function FrameLoop({
  idleFrames,
  fallbackUrl,
  alt,
  className,
  framerate = 6,
  flipHorizontal = false,
}: {
  idleFrames: string[] | null;
  fallbackUrl: string | null;
  alt: string;
  className: string;
  framerate?: number;
  flipHorizontal?: boolean;
}) {
  const [frameIdx, setFrameIdx] = useState(0);
  useEffect(() => {
    if (!idleFrames || idleFrames.length <= 1) return;
    const interval = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % idleFrames.length);
    }, Math.round(1000 / framerate));
    return () => window.clearInterval(interval);
  }, [idleFrames, framerate]);
  const src =
    idleFrames && idleFrames.length > 0
      ? (idleFrames[frameIdx % idleFrames.length] ?? fallbackUrl ?? "")
      : (fallbackUrl ?? "");
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ imageRendering: "pixelated", transform: flipHorizontal ? "scaleX(-1)" : undefined }}
    />
  );
}

function FloatingDamage({ value }: { value: number }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-2xl font-black text-amber-300"
      style={{
        textShadow: "0 0 4px #000, 0 0 8px #000",
        animation: "abyssFloatUp 1s ease-out forwards",
      }}
    >
      -{value}
      <style>{`
        @keyframes abyssFloatUp {
          0% { transform: translate(-50%, 0); opacity: 1; }
          100% { transform: translate(-50%, -50px); opacity: 0; }
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
      return {
        text: t(locale, "combat.log_attack", { actor, target, dmg: entry.dmg }),
        tone,
      };
    }
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
