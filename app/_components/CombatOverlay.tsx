"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { t, type Locale } from "@/lib/i18n";
import type {
  CombatLogEntry,
  CombatSession,
  CombatTurn,
  EncounterMob,
} from "@/lib/client/api";

/**
 * Phase 4b side-view combat overlay (FF VI / Chrono Trigger / Octopath
 * inspired). Full-screen React component that takes over while combat
 * is active. Player (warrior class) renders on the RIGHT facing west,
 * enemies on the LEFT facing east (we flip the south-facing sprite
 * horizontally — both sides of the same mirrored sprite).
 *
 * Server is authoritative: this component fires intents to
 * /combat/action and animates whatever entries come back in `appended`.
 *
 * Phase 4c will add:
 *   - PixelLab swing animations (sword swing / bow shoot / centaur
 *     trample) replacing the simple flash / shake here.
 *   - Sound effects.
 *   - Multi-action menu (item, run, defend).
 *   - Damage number animations beyond the simple float-up.
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
  /** Player's sprite atlas (from RoomState.player.sprite_atlas) so we
   *  can render the same class sprite the player uses in the world. */
  playerSpriteUrl: string | null;
  /** Player name + class for the lower-right info box. */
  playerName: string;
  playerLabel: string;
  /** Enriched mob metadata for the upper UI (names already localized). */
  mobs: EncounterMob[];
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
  playerSpriteUrl,
  playerName,
  playerLabel,
  mobs,
  onAttack,
  onClose,
}: Props) {
  const [session, setSession] = useState<CombatSession>(initialSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitFlash, setHitFlash] = useState<Set<string>>(new Set());
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const floatIdRef = useRef(1);
  /** Once combat is over, the player taps Continue (victory) or
   *  Respawn (defeat) — we keep the overlay showing the final state
   *  until then so the player can see the last damage numbers. */
  const [showOutcomeCard, setShowOutcomeCard] = useState(initialSession.is_over);

  // The current actor for highlighting. turn_order is always non-empty
  // (built with at least the player + one mob), but tsc requires the
  // fallback because index access can return undefined under strict.
  const currentTurn: CombatTurn =
    session.turn_order[session.turn_idx % session.turn_order.length] ?? { kind: "player" };

  /** Trigger flash + floating-number animations for log entries that
   *  just arrived. Called every time the server response comes back. */
  function animateAppended(appended: CombatLogEntry[]) {
    const flashKeys = new Set<string>();
    const newFloats: FloatingNumber[] = [];
    for (const entry of appended) {
      if (entry.kind === "attack") {
        flashKeys.add(entry.target);
        newFloats.push({
          id: floatIdRef.current++,
          target: entry.target,
          value: entry.dmg,
          variant: "damage",
        });
      }
    }
    if (flashKeys.size > 0) {
      setHitFlash((prev) => new Set([...prev, ...flashKeys]));
      window.setTimeout(() => {
        setHitFlash((prev) => {
          const next = new Set(prev);
          for (const k of flashKeys) next.delete(k);
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
        // Give the last hit time to land + numbers to float before
        // pulling up the outcome card.
        window.setTimeout(() => setShowOutcomeCard(true), 800);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Pick the first alive mob by default for the target picker so a
  // single tap on Attack works without a second decision.
  const defaultTargetIdx = useMemo(
    () => session.mobs.findIndex((m) => m.alive),
    [session.mobs],
  );

  /** Last few log lines as human-readable strings. */
  const recentLog = useMemo(() => {
    const all = session.log_entries.slice(-6);
    return all.map((e) => formatLogEntry(e, locale, session.mobs, mobs));
  }, [session.log_entries, session.mobs, locale, mobs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-abyss-void via-abyss-deep to-abyss-coal text-white">
      {/* Enemies row (top half) */}
      <div className="relative flex-1 px-4 pt-6">
        <div className="flex h-full items-end justify-around">
          {session.mobs.map((m, idx) => {
            const mobMeta = mobs[idx];
            const targetKey = `mob:${idx}`;
            const isHit = hitFlash.has(targetKey);
            // Side-view: enemies face EAST (toward player on the right).
            // PixelLab gives us a clean east-facing rotation.
            const sprite = m.sprite_atlas?.east ?? mobMeta?.sprite_atlas?.east ?? null;
            return (
              <div key={idx} className="flex flex-col items-center gap-2">
                <HpBar
                  label={mobMeta?.name_localized ?? m.name}
                  hp={m.hp}
                  max={m.max_hp}
                  variant="enemy"
                  isCurrentActor={currentTurn.kind === "mob" && currentTurn.idx === idx}
                />
                <div className="relative h-28 w-28">
                  {sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sprite}
                      alt={m.name}
                      className={
                        "h-full w-full object-contain transition-transform duration-200 " +
                        (m.alive ? "" : "opacity-30 grayscale ") +
                        (isHit ? "translate-x-1 scale-95 brightness-200" : "")
                      }
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div className="h-full w-full rounded bg-abyss-coal text-center text-xs">{m.name}</div>
                  )}
                  {/* Floating damage numbers for this mob */}
                  {floats
                    .filter((f) => f.target === targetKey)
                    .map((f) => (
                      <FloatingDamage key={f.id} value={f.value} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Player row (bottom half) */}
      <div className="relative flex-1 px-4 pb-4">
        <div className="flex h-full items-end justify-around">
          <div className="flex flex-col items-center gap-2">
            <HpBar
              label={playerName}
              hp={session.player_hp}
              max={session.player_max_hp}
              variant="player"
              isCurrentActor={currentTurn.kind === "player" && !session.is_over}
            />
            <div className="relative h-32 w-32">
              {playerSpriteUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={playerSpriteUrl}
                  alt={playerName}
                  className={
                    "h-full w-full object-contain transition-transform duration-200 " +
                    (hitFlash.has("player") ? "-translate-x-1 scale-95 brightness-200" : "")
                  }
                  style={{ imageRendering: "pixelated", transform: "scaleX(-1)" }}
                />
              ) : null}
              {floats
                .filter((f) => f.target === "player")
                .map((f) => (
                  <FloatingDamage key={f.id} value={f.value} />
                ))}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-abyss-fog">{playerLabel}</p>
          </div>
        </div>
      </div>

      {/* Combat log strip */}
      <div className="border-t border-abyss-coal/80 bg-abyss-void/80 px-3 py-2">
        <div className="max-h-16 overflow-y-auto text-[10px] leading-tight">
          {recentLog.map((line, i) => (
            <p key={i} className={line.tone}>{line.text}</p>
          ))}
        </div>
      </div>

      {/* Action menu */}
      {!session.is_over ? (
        <div className="grid grid-cols-2 gap-2 border-t-2 border-abyss-soul/60 bg-abyss-deep px-3 py-3">
          <button
            type="button"
            disabled={busy || currentTurn.kind !== "player" || defaultTargetIdx < 0}
            onClick={() => handleAttack(defaultTargetIdx)}
            className="rounded bg-abyss-ember/90 px-3 py-2 text-xs font-bold uppercase tracking-widest text-abyss-void hover:bg-abyss-ember disabled:opacity-40"
          >
            {t(locale, "combat.action_attack")}
          </button>
          <div className="flex items-center justify-center text-[10px] text-abyss-fog">
            {busy
              ? t(locale, "combat.resolving")
              : currentTurn.kind === "player"
                ? t(locale, "combat.your_turn")
                : t(locale, "combat.enemy_turn")}
          </div>
          {/* Per-mob target buttons when more than one mob is alive */}
          {session.mobs.filter((m) => m.alive).length > 1 ? (
            <div className="col-span-2 flex gap-2">
              {session.mobs.map((m, idx) =>
                m.alive ? (
                  <button
                    key={idx}
                    type="button"
                    disabled={busy || currentTurn.kind !== "player"}
                    onClick={() => handleAttack(idx)}
                    className="flex-1 rounded border border-abyss-soul/60 bg-abyss-coal px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-abyss-soul/20 disabled:opacity-40"
                  >
                    → {mobs[idx]?.name_localized ?? m.name}
                  </button>
                ) : null,
              )}
            </div>
          ) : null}
          {error ? (
            <p className="col-span-2 text-[10px] text-abyss-ember">{error}</p>
          ) : null}
        </div>
      ) : null}

      {/* Outcome card — appears after a beat post-final-hit */}
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

function HpBar({
  label,
  hp,
  max,
  variant,
  isCurrentActor,
}: {
  label: string;
  hp: number;
  max: number;
  variant: "player" | "enemy";
  isCurrentActor: boolean;
}) {
  const pct = max > 0 ? Math.max(0, (hp / max) * 100) : 0;
  const color =
    pct > 60 ? "bg-emerald-500" : pct > 25 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className={"w-32 " + (isCurrentActor ? "ring-2 ring-abyss-soul" : "")}>
      <div className="flex items-baseline justify-between text-[10px]">
        <span className="truncate font-semibold">{label}</span>
        <span className="tabular-nums text-abyss-fog">{hp}/{max}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-abyss-coal/70">
        <div
          className={"h-full transition-all duration-300 " + color}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-center text-[8px] uppercase tracking-widest text-abyss-fog/70">
        {variant === "player" ? "PV" : "HP"}
      </p>
    </div>
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
          100% { transform: translate(-50%, -40px); opacity: 0; }
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

/** Human-readable line for one log entry. */
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
