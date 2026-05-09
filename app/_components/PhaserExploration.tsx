"use client";

import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  fetchRoom,
  moveCharacter,
  type Direction,
  type RoomNpc,
  type RoomState,
} from "@/lib/client/api";
import { t, type Locale } from "@/lib/i18n";

import DialogueModal from "./DialogueModal";

type Props = {
  initData: string;
  characterId: string;
  characterName: string;
  locale: Locale;
  onExit: () => void;
};

const BANNER_DURATION_MS = 2200;

export default function PhaserExploration({
  initData,
  characterId,
  characterName,
  locale,
  onExit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const sceneRef = useRef<unknown>(null);
  const stateRef = useRef<RoomState | null>(null);

  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [adjacentNpc, setAdjacentNpc] = useState<RoomNpc | null>(null);
  const [activeNpc, setActiveNpc] = useState<RoomNpc | null>(null);
  const [moving, setMoving] = useState(false);

  // Boot Phaser once. doMove is captured via closure → fine to skip dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    void boot();
    return () => {
      cancelled = true;
      const g = gameRef.current as { destroy?: (b: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
      sceneRef.current = null;
    };

    async function boot() {
      try {
        const initial = await fetchRoom({ initData, characterId, locale });
        if (cancelled) return;
        stateRef.current = initial;
        setState(initial);
        flashBanner();

        const PhaserMod = await import("phaser");
        const sceneMod = await import("@/lib/game/scene");
        const Phaser = PhaserMod.default;
        const { AbyssScene } = sceneMod;

        if (cancelled) return;

        const callbacks = {
          onExitRequested: (direction: Direction) => {
            if (cancelled) return;
            void doMove(direction);
          },
          onNpcAdjacent: (npcId: string | null) => {
            if (cancelled) return;
            const cur = stateRef.current;
            const npc =
              cur && npcId ? cur.npcs.find((n) => n.id === npcId) ?? null : null;
            setAdjacentNpc(npc);
          },
        };

        const game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current!,
          backgroundColor: "#06070C",
          pixelArt: true,
          antialias: false,
          fps: { target: 30, forceSetTimeOut: true },
          scale: {
            // RESIZE keeps the canvas filling the wrapper div on every
            // viewport change. The camera follows the player so even
            // tall portrait screens reveal more map without leaving big
            // black bars at top/bottom.
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: "100%",
            height: "100%",
          },
          scene: [],
          autoFocus: false,
          // Listen to input events ONLY on the canvas, not on the window. Without
          // this Phaser registers global touch handlers that capture taps on the
          // overlaid D-pad buttons before they reach React. Keyboard arrows still
          // work because they're registered on the canvas focus.
          input: { windowEvents: false },
        });
        gameRef.current = game;

        // Add the scene with autoStart so init() runs with our state +
        // callbacks. `add()` can return null in Phaser 4 when the manager
        // hasn't finished booting yet, so we don't trust its return value:
        // we poll `getScene(KEY)` until the instance is available, then
        // store it in the ref. The user reported `sceneRefType: 'object'`
        // with `sceneOk: false`, which is `typeof null === 'object'` — i.e.
        // we were caching the null that `add()` handed back.
        game.scene.add(AbyssScene.KEY, AbyssScene, true, {
          state: initial,
          callbacks,
        });

        const attachScene = (attempt = 0) => {
          if (cancelled) return;
          const live = game.scene.getScene(AbyssScene.KEY) as
            | InstanceType<typeof AbyssScene>
            | null;
          if (live && typeof live.pressDirectionOnce === "function") {
            sceneRef.current = live;
            console.log("[abyss/boot] scene attached", { attempt });
            return;
          }
          if (attempt >= 50) {
            console.warn("[abyss/boot] scene never appeared after 50 retries");
            return;
          }
          setTimeout(() => attachScene(attempt + 1), 30);
        };
        attachScene();
      } catch (err) {
        if (!cancelled) setError(humanize(err, locale));
      }
    }
  }, [initData, characterId, locale]);

  function flashBanner() {
    setShowBanner(true);
    window.setTimeout(() => setShowBanner(false), BANNER_DURATION_MS);
  }

  async function doMove(direction: Direction) {
    if (moving) return;
    setMoving(true);
    try {
      await moveCharacter({ initData, characterId, direction });
      const next = await fetchRoom({ initData, characterId, locale });
      stateRef.current = next;
      setState(next);
      // Hot-reload the room without using scene.restart(), which triggers
      // "sys null" crashes in Phaser 4. The scene keeps its callbacks
      // (no init() re-run) and only the per-room game objects rebuild.
      const scene = sceneRef.current as { loadRoom?: (s: RoomState) => void } | null;
      scene?.loadRoom?.(next);
      flashBanner();
    } catch (err) {
      setError(humanize(err, locale));
    } finally {
      setMoving(false);
    }
  }

  function dpadPress(direction: Direction) {
    const scene = sceneRef.current as { pressDirectionOnce?: (d: Direction) => void } | null;
    scene?.pressDirectionOnce?.(direction);
  }

  function dpadHold(direction: Direction | null) {
    const scene = sceneRef.current as { setVirtualDirection?: (d: Direction | null) => void } | null;
    scene?.setVirtualDirection?.(direction);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-abyss-coal/80 bg-abyss-deep px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="text-[10px] uppercase tracking-widest text-abyss-mist hover:text-white"
        >
          ‹ {t(locale, "exploration.back_to_hub")}
        </button>
        <span className="truncate text-[10px] uppercase tracking-widest text-abyss-fog">
          {characterName}
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-lg border border-abyss-coal/80 bg-abyss-void"
        style={{ height: "calc(100dvh - 180px)", minHeight: "400px" }}
      >
        {/* Phaser canvas. pointer-events:none on the wrapper + the
            data-attribute selector in globals.css make sure the <canvas>
            Phaser injects also inherits pointer-events:none. Without the
            CSS override the canvas was intercepting taps on the D-pad. */}
        <div
          ref={containerRef}
          data-phaser-canvas-host=""
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
        />

        {showBanner && state ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="rounded-md border border-abyss-soul/60 bg-abyss-deep/90 px-4 py-2 text-center shadow-lg backdrop-blur">
              <p className="text-[9px] uppercase tracking-[0.4em] text-abyss-fog">
                {t(locale, "exploration.floor_label", { floor: state.room.floor_number })}
                {" · "}
                {t(locale, `exploration.room_type.${state.room.room_type}`)}
              </p>
              <p className="mt-0.5 bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-base font-bold uppercase tracking-widest text-transparent">
                {state.room.name_localized}
              </p>
            </div>
          </div>
        ) : null}

        {/* NPC adjacent CTA — overlays the canvas at top-left when available */}
        {adjacentNpc ? (
          <button
            type="button"
            onClick={() => setActiveNpc(adjacentNpc)}
            className="absolute left-2 right-2 top-2 flex items-center gap-2 rounded-md border border-abyss-soul/70 bg-abyss-deep/95 p-2 text-left shadow-lg backdrop-blur sm:left-auto sm:right-2 sm:max-w-[220px]"
          >
            {adjacentNpc.portrait_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={adjacentNpc.portrait_url}
                alt={adjacentNpc.name_localized}
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded bg-abyss-void object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{adjacentNpc.name_localized}</p>
              <p className="text-[9px] uppercase tracking-widest text-abyss-soul">
                {t(locale, "exploration.talk_prompt")}
              </p>
            </div>
            <span className="text-abyss-soul">›</span>
          </button>
        ) : null}

        {/* D-pad pinned to bottom-right of the canvas as a HUD overlay.
            Explicit z-index so it sits above the Phaser <canvas>, and the
            buttons stop propagation in their handlers so any stray Phaser
            input listener can't swallow the tap. */}
        <div className="absolute bottom-2 right-2 z-30">
          <DPad onPress={dpadPress} onHold={dpadHold} disabled={moving} />
        </div>

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-abyss-void/80 p-6 text-center">
            <p className="text-sm text-abyss-ember">{error}</p>
          </div>
        ) : null}
      </div>

      {state?.room.description_localized ? (
        <p className="text-[11px] leading-relaxed text-abyss-mist">
          {state.room.description_localized}
        </p>
      ) : null}

      {activeNpc ? (
        <DialogueModal
          initData={initData}
          characterId={characterId}
          npc={activeNpc}
          locale={locale}
          onClose={async () => {
            setActiveNpc(null);
            try {
              const refreshed = await fetchRoom({ initData, characterId, locale });
              stateRef.current = refreshed;
              setState(refreshed);
            } catch {
              // best-effort
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * `LONG_PRESS_DELAY_MS` is the threshold below which a button release counts
 * as a "tap" — that means a single grid step. Holding past this threshold
 * activates the continuous-walk virtual direction, which the Phaser update
 * loop polls every frame.
 *
 * Why split the two: when both happened on every press, a long-ish tap
 * (~200ms — typical on touchscreens) produced two moves. The press fired
 * one step + set the virtual direction, then the next update tick after
 * the cooldown picked up the still-set virtual direction and stepped
 * again. Splitting the modes by press duration makes the behaviour
 * deterministic regardless of how long the user holds.
 */
const LONG_PRESS_DELAY_MS = 250;

function DPad({
  onPress,
  onHold,
  disabled,
}: {
  onPress: (d: Direction) => void;
  onHold: (d: Direction | null) => void;
  disabled?: boolean;
}) {
  const dirs: Array<{ id: Direction; row: number; col: number; arrow: string }> = [
    { id: "north", row: 1, col: 2, arrow: "↑" },
    { id: "west", row: 2, col: 1, arrow: "←" },
    { id: "east", row: 2, col: 3, arrow: "→" },
    { id: "south", row: 3, col: 2, arrow: "↓" },
  ];
  // One timer per button instance so quick-fire taps don't fight each other.
  const holdTimeouts = useRef<Map<Direction, ReturnType<typeof setTimeout>>>(new Map());
  /**
   * Modern browsers fire BOTH `pointerdown` and `touchstart` for a single
   * tap. We register both handlers because some older WebViews only emit
   * touch events, but dedupe by timestamp so a single physical tap doesn't
   * count as two presses (which was producing the double-step regression).
   */
  const lastPressAt = useRef<Map<Direction, number>>(new Map());
  const DEDUP_MS = 120;

  function startPress(direction: Direction) {
    if (disabled) return;
    const now = performance.now();
    const last = lastPressAt.current.get(direction) ?? 0;
    if (now - last < DEDUP_MS) return; // ghost event from sibling pointer/touch handler
    lastPressAt.current.set(direction, now);
    onPress(direction);
    const existing = holdTimeouts.current.get(direction);
    if (existing) clearTimeout(existing);
    holdTimeouts.current.set(
      direction,
      setTimeout(() => onHold(direction), LONG_PRESS_DELAY_MS),
    );
  }

  function endPress(direction: Direction) {
    const existing = holdTimeouts.current.get(direction);
    if (existing) {
      clearTimeout(existing);
      holdTimeouts.current.delete(direction);
    }
    onHold(null);
  }

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[160px] select-none">
      {dirs.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startPress(d.id);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            endPress(d.id);
          }}
          onPointerLeave={() => endPress(d.id)}
          onPointerCancel={() => endPress(d.id)}
          // Older mobile browsers (some Telegram WebViews) deliver touchstart
          // before pointerdown is normalised — handle both so the input is
          // never swallowed by a sibling.
          onTouchStart={(e) => {
            e.stopPropagation();
            startPress(d.id);
          }}
          onTouchEnd={() => endPress(d.id)}
          style={{ gridRow: d.row, gridColumn: d.col, touchAction: "none" }}
          className="h-12 w-12 rounded-md border border-abyss-coal/80 bg-abyss-deep/95 text-lg text-abyss-mist shadow-md backdrop-blur transition active:bg-abyss-khaos/40 active:text-white disabled:opacity-50"
        >
          {d.arrow}
        </button>
      ))}
    </div>
  );
}

function humanize(err: unknown, locale: Locale): string {
  if (err instanceof ApiError) {
    const localized = t(locale, `errors.${err.code}`);
    if (localized !== `errors.${err.code}`) return localized;
    return err.detail ?? err.code;
  }
  return err instanceof Error ? err.message : t(locale, "errors.generic");
}
