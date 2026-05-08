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
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: 320,
            height: 256,
          },
          scene: [],
          autoFocus: false,
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
      const scene = sceneRef.current as { scene: { restart: (data: unknown) => void } } | null;
      scene?.scene.restart({ state: next });
      flashBanner();
    } catch (err) {
      setError(humanize(err, locale));
    } finally {
      setMoving(false);
    }
  }

  function dpadPress(direction: Direction) {
    const scene = sceneRef.current as { pressDirectionOnce: (d: Direction) => void } | null;
    scene?.pressDirectionOnce(direction);
  }

  function dpadHold(direction: Direction | null) {
    const scene = sceneRef.current as { setVirtualDirection: (d: Direction | null) => void } | null;
    scene?.setVirtualDirection(direction);
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

      <div className="relative aspect-[5/4] w-full overflow-hidden rounded-lg border border-abyss-coal/80 bg-abyss-void">
        <div ref={containerRef} className="absolute inset-0" />

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

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-abyss-void/80 p-6 text-center">
            <p className="text-sm text-abyss-ember">{error}</p>
          </div>
        ) : null}
      </div>

      {state?.room.description_localized ? (
        <p className="text-xs leading-relaxed text-abyss-mist">
          {state.room.description_localized}
        </p>
      ) : null}

      {adjacentNpc ? (
        <button
          type="button"
          onClick={() => setActiveNpc(adjacentNpc)}
          className="flex w-full items-center gap-3 rounded-lg border border-abyss-soul/60 bg-abyss-deep p-3 text-left transition hover:border-abyss-soul"
        >
          {adjacentNpc.portrait_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={adjacentNpc.portrait_url}
              alt={adjacentNpc.name_localized}
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded bg-abyss-void object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{adjacentNpc.name_localized}</p>
            <p className="text-[10px] uppercase tracking-widest text-abyss-soul">
              {t(locale, "exploration.talk_prompt")}
            </p>
          </div>
          <span className="text-abyss-soul">›</span>
        </button>
      ) : null}

      <DPad onPress={dpadPress} onHold={dpadHold} disabled={moving} />

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
    <div className="grid grid-cols-3 grid-rows-3 gap-1.5 max-w-[260px] mx-auto">
      {dirs.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={disabled}
          onPointerDown={() => {
            if (disabled) return;
            onPress(d.id);
            onHold(d.id);
          }}
          onPointerUp={() => onHold(null)}
          onPointerLeave={() => onHold(null)}
          onPointerCancel={() => onHold(null)}
          style={{ gridRow: d.row, gridColumn: d.col }}
          className="rounded-md border border-abyss-coal/80 bg-abyss-deep py-3 text-lg text-abyss-mist transition active:bg-abyss-khaos/30 active:text-white disabled:opacity-50"
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
