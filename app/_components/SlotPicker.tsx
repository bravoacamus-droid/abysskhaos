"use client";

import { type CharacterRow, type ClassRow } from "@/lib/client/api";
import { t, type Locale } from "@/lib/i18n";

const FREE_SLOTS = [1, 2] as const;
const PAID_SLOTS = [3, 4] as const;

type Props = {
  characters: CharacterRow[];
  activeId: string | null;
  classMap: Map<string, ClassRow>;
  locale: Locale;
  onSelect: (characterId: string) => void;
  onForge: () => void;
};

export default function SlotPicker({
  characters,
  activeId,
  classMap,
  locale,
  onSelect,
  onForge,
}: Props) {
  const bySlot = new Map<number, CharacterRow>();
  for (const c of characters) bySlot.set(c.slot_index, c);

  return (
    <div className="grid grid-cols-4 gap-2">
      {FREE_SLOTS.map((slot) => {
        const c = bySlot.get(slot);
        if (c) {
          const klass = classMap.get(c.class_id);
          const isActive = c.id === activeId;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex flex-col items-stretch overflow-hidden rounded-md border bg-abyss-deep p-1.5 text-left transition ${
                isActive
                  ? "border-abyss-soul/80 shadow-md shadow-abyss-soul/20"
                  : "border-abyss-coal/80 hover:border-abyss-khaos/60"
              }`}
            >
              {klass?.portrait_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={klass.portrait_url}
                  alt={klass.name_localized}
                  width={64}
                  height={64}
                  className="h-12 w-full rounded bg-abyss-void object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="h-12 w-full rounded bg-abyss-coal" />
              )}
              <p className="mt-1 truncate text-[11px] font-semibold text-white">{c.name}</p>
              <p className="text-[9px] uppercase tracking-widest text-abyss-fog">
                {t(locale, "hub.level", { level: c.level })}
              </p>
            </button>
          );
        }
        return (
          <button
            key={slot}
            type="button"
            onClick={onForge}
            className="flex h-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-abyss-khaos/50 bg-abyss-deep p-1.5 text-abyss-fog transition hover:border-abyss-khaos hover:text-white"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-[9px] uppercase tracking-widest">
              {t(locale, "slot_picker.forge")}
            </span>
          </button>
        );
      })}
      {PAID_SLOTS.map((slot) => (
        <div
          key={slot}
          aria-disabled
          title={t(locale, "slot_picker.locked_paid")}
          className="flex h-full flex-col items-center justify-center gap-1 rounded-md border border-abyss-coal/60 bg-abyss-void/40 p-1.5 text-abyss-fog/60"
        >
          <span className="text-lg leading-none">🔒</span>
          <span className="text-[9px] uppercase tracking-widest">
            {t(locale, "slot_picker.locked_short")}
          </span>
        </div>
      ))}
    </div>
  );
}
