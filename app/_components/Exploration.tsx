"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  fetchRoom,
  moveCharacter,
  type RoomConnectionRow,
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

export default function Exploration({
  initData,
  characterId,
  characterName,
  locale,
  onExit,
}: Props) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [activeNpc, setActiveNpc] = useState<RoomNpc | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();

    async function load(signal: AbortSignal) {
      try {
        const data = await fetchRoom({ initData, characterId, locale, signal });
        setState(data);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(humanize(err, locale));
      }
    }
  }, [initData, characterId, locale]);

  async function move(direction: "north" | "south" | "east" | "west") {
    if (moving || !state) return;
    setMoving(true);
    try {
      await moveCharacter({ initData, characterId, direction });
      // Re-fetch the new room.
      const next = await fetchRoom({ initData, characterId, locale });
      setState(next);
    } catch (err) {
      setError(humanize(err, locale));
    } finally {
      setMoving(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackBar locale={locale} onExit={onExit} />
        <div className="rounded-lg border border-abyss-ember/40 bg-abyss-deep p-6">
          <p className="text-xs uppercase tracking-widest text-abyss-ember">
            {t(locale, "exploration.error_title")}
          </p>
          <p className="mt-3 text-sm text-abyss-mist">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="space-y-4">
        <BackBar locale={locale} onExit={onExit} />
        <div className="rounded-lg border border-abyss-coal/80 bg-abyss-deep p-6 text-center text-abyss-mist">
          <p className="text-sm uppercase tracking-widest">
            {t(locale, "exploration.loading")}
          </p>
        </div>
      </div>
    );
  }

  const connectionByDir = new Map<string, RoomConnectionRow>();
  for (const c of state.connections) connectionByDir.set(c.direction, c);

  return (
    <div className="space-y-4">
      <BackBar locale={locale} onExit={onExit} characterName={characterName} />

      <RoomCard state={state} locale={locale} />

      {state.npcs.length > 0 ? (
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-abyss-fog">
            {t(locale, "exploration.npcs_here")}
          </p>
          <div className="space-y-2">
            {state.npcs.map((npc) => (
              <button
                key={npc.id}
                type="button"
                onClick={() => setActiveNpc(npc)}
                className="flex w-full items-center gap-3 rounded-lg border border-abyss-coal/80 bg-abyss-deep p-3 text-left transition hover:border-abyss-soul/60"
              >
                {npc.portrait_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={npc.portrait_url}
                    alt={npc.name_localized}
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded bg-abyss-void object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded bg-abyss-coal" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{npc.name_localized}</p>
                  {npc.title_localized ? (
                    <p className="truncate text-xs text-abyss-mist">{npc.title_localized}</p>
                  ) : null}
                  {npc.has_unmet_first_dialogue ? (
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-abyss-soul">
                      {t(locale, "exploration.npc_unmet")}
                    </p>
                  ) : null}
                </div>
                <span className="text-abyss-fog">›</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Compass
        connections={connectionByDir}
        moving={moving}
        onMove={move}
        locale={locale}
      />

      {activeNpc && state ? (
        <DialogueModal
          initData={initData}
          characterId={characterId}
          npc={activeNpc}
          locale={locale}
          onClose={() => {
            setActiveNpc(null);
            // Re-fetch to refresh has_unmet_first_dialogue flag.
            void fetchRoom({ initData, characterId, locale })
              .then(setState)
              .catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}

function BackBar({
  locale,
  onExit,
  characterName,
}: {
  locale: Locale;
  onExit: () => void;
  characterName?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-abyss-coal/80 bg-abyss-deep px-3 py-2">
      <button
        type="button"
        onClick={onExit}
        className="text-[10px] uppercase tracking-widest text-abyss-mist hover:text-white"
      >
        ‹ {t(locale, "exploration.back_to_hub")}
      </button>
      {characterName ? (
        <span className="truncate text-[10px] uppercase tracking-widest text-abyss-fog">
          {characterName}
        </span>
      ) : null}
    </div>
  );
}

function RoomCard({ state, locale }: { state: RoomState; locale: Locale }) {
  const isSafe = state.room.is_safe;
  return (
    <section
      className={`rounded-lg border p-5 ${
        isSafe ? "border-abyss-soul/40 bg-abyss-deep" : "border-abyss-coal/80 bg-abyss-deep"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-abyss-fog">
        {t(locale, "exploration.floor_label", { floor: state.room.floor_number })}
        {" · "}
        {t(locale, `exploration.room_type.${state.room.room_type}`)}
      </p>
      <h2
        className={`mt-1 text-2xl font-bold leading-tight ${
          isSafe
            ? "bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-transparent"
            : "text-white"
        }`}
      >
        {state.room.name_localized}
      </h2>
      {state.room.description_localized ? (
        <p className="mt-3 text-sm leading-relaxed text-abyss-mist">
          {state.room.description_localized}
        </p>
      ) : null}
    </section>
  );
}

function Compass({
  connections,
  moving,
  onMove,
  locale,
}: {
  connections: Map<string, RoomConnectionRow>;
  moving: boolean;
  onMove: (d: "north" | "south" | "east" | "west") => void;
  locale: Locale;
}) {
  const dirs: Array<{ id: "north" | "south" | "east" | "west"; row: number; col: number }> = [
    { id: "north", row: 1, col: 2 },
    { id: "west", row: 2, col: 1 },
    { id: "east", row: 2, col: 3 },
    { id: "south", row: 3, col: 2 },
  ];
  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-abyss-fog">
        {t(locale, "exploration.move_label")}
      </p>
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        {dirs.map((d) => {
          const conn = connections.get(d.id);
          const disabled = !conn || conn.is_locked || moving;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onMove(d.id)}
              disabled={disabled}
              style={{ gridRow: d.row, gridColumn: d.col }}
              className={`rounded-md border py-3 text-xs font-semibold uppercase tracking-widest transition ${
                disabled
                  ? "border-abyss-coal/40 bg-abyss-deep text-abyss-fog/50"
                  : "border-abyss-coal/80 bg-abyss-deep text-abyss-mist hover:border-abyss-soul/60 hover:text-white"
              }`}
            >
              {arrowFor(d.id)}
              <span className="ml-1">{t(locale, `exploration.direction.${d.id}`)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function arrowFor(d: "north" | "south" | "east" | "west"): string {
  return d === "north" ? "↑" : d === "south" ? "↓" : d === "east" ? "→" : "←";
}

function humanize(err: unknown, locale: Locale): string {
  if (err instanceof ApiError) {
    const localized = t(locale, `errors.${err.code}`);
    if (localized !== `errors.${err.code}`) return localized;
    return err.detail ?? err.code;
  }
  return err instanceof Error ? err.message : t(locale, "errors.generic");
}
