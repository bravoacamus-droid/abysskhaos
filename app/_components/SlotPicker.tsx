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
  /** Owner accounts get unlimited characters + delete buttons. */
  isOwner: boolean;
  onSelect: (characterId: string) => void;
  onForge: () => void;
  onDelete: (characterId: string) => void;
};

/** One character tile (portrait + name + level). Shared by both modes. */
function CharacterCard({
  c,
  klass,
  isActive,
  locale,
  onSelect,
  onDelete,
}: {
  c: CharacterRow;
  klass: ClassRow | undefined;
  isActive: boolean;
  locale: Locale;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        className={`flex w-full flex-col items-stretch overflow-hidden rounded-md border bg-abyss-deep p-1.5 text-left transition ${
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
      {onDelete ? (
        <button
          type="button"
          aria-label={t(locale, "slot_picker.delete")}
          title={t(locale, "slot_picker.delete")}
          onClick={() => {
            if (window.confirm(t(locale, "slot_picker.delete_confirm", { name: c.name }))) {
              onDelete(c.id);
            }
          }}
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-abyss-ember/70 bg-abyss-void text-[11px] font-bold leading-none text-abyss-ember shadow hover:bg-abyss-ember hover:text-abyss-void"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** "Forge" call-to-action tile. */
function ForgeTile({ locale, onForge }: { locale: Locale; onForge: () => void }) {
  return (
    <button
      type="button"
      onClick={onForge}
      className="flex h-full min-h-[78px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-abyss-khaos/50 bg-abyss-deep p-1.5 text-abyss-fog transition hover:border-abyss-khaos hover:text-white"
    >
      <span className="text-2xl leading-none">+</span>
      <span className="text-[9px] uppercase tracking-widest">{t(locale, "slot_picker.forge")}</span>
    </button>
  );
}

export default function SlotPicker({
  characters,
  activeId,
  classMap,
  locale,
  isOwner,
  onSelect,
  onForge,
  onDelete,
}: Props) {
  // OWNER MODE: unlimited characters — render every character (sorted by
  // slot) with a delete button + an always-available forge tile. No paid
  // locks; the owner has no entitlement ceiling.
  if (isOwner) {
    const sorted = [...characters].sort((a, b) => a.slot_index - b.slot_index);
    return (
      <div className="grid grid-cols-4 gap-2">
        {sorted.map((c) => (
          <CharacterCard
            key={c.id}
            c={c}
            klass={classMap.get(c.class_id)}
            isActive={c.id === activeId}
            locale={locale}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
        <ForgeTile locale={locale} onForge={onForge} />
      </div>
    );
  }

  // DEFAULT MODE: free slots 1-2 + paid (locked) slots 3-4.
  const bySlot = new Map<number, CharacterRow>();
  for (const c of characters) bySlot.set(c.slot_index, c);

  return (
    <div className="grid grid-cols-4 gap-2">
      {FREE_SLOTS.map((slot) => {
        const c = bySlot.get(slot);
        if (c) {
          return (
            <CharacterCard
              key={slot}
              c={c}
              klass={classMap.get(c.class_id)}
              isActive={c.id === activeId}
              locale={locale}
              onSelect={onSelect}
            />
          );
        }
        return <ForgeTile key={slot} locale={locale} onForge={onForge} />;
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
