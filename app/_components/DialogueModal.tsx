"use client";

import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  fetchDialogue,
  markDialogueRead,
  type DialogueLine,
  type RoomNpc,
} from "@/lib/client/api";
import { t, type Locale } from "@/lib/i18n";

type Props = {
  initData: string;
  characterId: string;
  npc: RoomNpc;
  locale: Locale;
  onClose: () => void;
};

export default function DialogueModal({ initData, characterId, npc, locale, onClose }: Props) {
  const [lines, setLines] = useState<DialogueLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    fetchDialogue({ initData, characterId, npcId: npc.id, locale, signal: ac.signal })
      .then((d) => setLines(d.lines))
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof ApiError ? err.code : (err as Error).message);
        }
      });
    return () => ac.abort();
  }, [initData, characterId, npc.id, locale]);

  const [closing, setClosing] = useState(false);
  /** True once we've POSTed the mark-read for this dialogue. Idempotent
   *  guard so the close handler can be wired to X / backdrop / final
   *  Terminar button without firing the POST multiple times. */
  const markedReadRef = useRef(false);

  /** Single source of truth for closing the modal. EVERY path that
   *  closes (X button, backdrop click, final Terminar) goes through
   *  here so the tutorial advance always fires server-side — even if
   *  the player chose to skip mid-dialogue. Awaits the POST before
   *  calling onClose so the parent's followup fetchRoom can't race. */
  async function closeWithMark() {
    if (closing) return;
    setClosing(true);
    if (!markedReadRef.current) {
      markedReadRef.current = true;
      try {
        await markDialogueRead({ initData, characterId, npcId: npc.id });
      } catch {
        // best-effort — even if the POST fails we still close the modal
      }
    }
    setClosing(false);
    onClose();
  }

  function advance() {
    if (!lines) return;
    if (index < lines.length - 1) {
      setIndex(index + 1);
      return;
    }
    void closeWithMark();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={() => void closeWithMark()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-lg border border-abyss-coal/80 bg-abyss-deep p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3">
          {npc.portrait_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={npc.portrait_url}
              alt={npc.name_localized}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded bg-abyss-void object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded bg-abyss-coal" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-white">{npc.name_localized}</p>
            {npc.title_localized ? (
              <p className="truncate text-xs text-abyss-mist">{npc.title_localized}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void closeWithMark()}
            disabled={closing}
            className="rounded-md border border-abyss-coal/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-abyss-fog hover:border-abyss-fog/60 hover:text-abyss-mist disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        <div className="mt-4 min-h-[140px] rounded-md bg-abyss-void/60 p-4">
          {error ? (
            <p className="text-sm text-abyss-ember">{error}</p>
          ) : !lines ? (
            <p className="text-sm uppercase tracking-widest text-abyss-fog">
              {t(locale, "exploration.dialogue_loading")}
            </p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-abyss-mist">{t(locale, "exploration.dialogue_empty")}</p>
          ) : (
            <Line line={lines[index]!} />
          )}
        </div>

        {lines && lines.length > 0 ? (
          <footer className="mt-4 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-abyss-fog">
              {index + 1} / {lines.length}
            </span>
            <button
              type="button"
              onClick={advance}
              className="rounded-md bg-abyss-soul px-4 py-2 text-xs font-semibold uppercase tracking-widest text-abyss-void transition hover:bg-abyss-soul/90"
            >
              {index < lines.length - 1
                ? t(locale, "exploration.dialogue_next")
                : t(locale, "exploration.dialogue_close")}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function Line({ line }: { line: DialogueLine }) {
  if (line.speaker === "narrator") {
    return (
      <p className="text-sm italic leading-relaxed text-abyss-mist">{line.text_localized}</p>
    );
  }
  return (
    <p className="text-sm font-medium leading-relaxed text-white">{line.text_localized}</p>
  );
}
