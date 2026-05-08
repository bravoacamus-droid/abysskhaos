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
  // Temporary instrumentation while we hunt down "D-pad clicks but nothing
  // happens" on the live Telegram WebView. Each press updates this string;
  // a small HUD renders it on top of the canvas. Strip after the input
  // chain is verified end-to-end.
  const [debugTrace, setDebugTrace] = useState<string>("idle");

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
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: 320,
            height: 256,
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

        // Add scene + auto-start with init data (state + callbacks). This is
        // the only place that handles startup, so events emitter timing
        // is irrelevant — the scene calls our callbacks directly.
        const scene = game.scene.add(AbyssScene.KEY, AbyssScene, true, {
          state: initial,
          callbacks,
        }) as InstanceType<typeof AbyssScene>;
        sceneRef.current = scene;
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
    const scene = sceneRef.current as
      | {
          pressDirectionOnce?: (d: Direction) => void;
        }
      | null;
    const sceneOk = !!scene && typeof scene.pressDirectionOnce === "function";
    const stamp = new Date().toISOString().slice(11, 19);
    setDebugTrace(`press ${direction} @ ${stamp} · scene:${sceneOk ? "ok" : "missing"}`);
    if (typeof window !== "undefined") {
      console.log("[abyss/dpad]", { direction, sceneOk, sceneRefType: typeof scene });
    }
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
        style={{ height: "calc(100dvh - 220px)", maxHeight: "560px", minHeight: "320px" }}
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

        {/* TEMP: visible input trace so we can see press events without the
            console. Strip when the D-pad chain is confirmed end-to-end. */}
        <div className="pointer-events-none absolute left-2 top-2 z-40 rounded bg-abyss-void/80 px-2 py-1 font-mono text-[9px] text-abyss-soul">
          {debugTrace}
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
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[160px] select-none">
      {dirs.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            e.stopPropagation();
            onPress(d.id);
            onHold(d.id);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            onHold(null);
          }}
          onPointerLeave={() => onHold(null)}
          onPointerCancel={() => onHold(null)}
          // Older mobile browsers (some Telegram WebViews) deliver touchstart
          // before pointerdown is normalised — handle both so the input is
          // never swallowed by a sibling.
          onTouchStart={(e) => {
            if (disabled) return;
            e.stopPropagation();
            onPress(d.id);
            onHold(d.id);
          }}
          onTouchEnd={() => onHold(null)}
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
