"use client";

import { useState } from "react";

import { type CharacterRow, type ClassRow } from "@/lib/client/api";
import { t, type Locale } from "@/lib/i18n";

type Tab = "character" | "inventory" | "bestiary" | "shop" | "map";

type Props = {
  character: CharacterRow;
  klass: ClassRow | null;
  locale: Locale;
  onDescend: () => void;
};

export default function Hub({ character, klass, locale, onDescend }: Props) {
  const [tab, setTab] = useState<Tab>("character");

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4 rounded-lg border border-abyss-coal/80 bg-abyss-deep p-4">
        {klass?.portrait_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={klass.portrait_url}
            alt={klass.name_localized}
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-md border border-abyss-coal/60 bg-abyss-void object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div className="h-24 w-24 shrink-0 rounded-md bg-abyss-coal" />
        )}
        <div className="min-w-0 flex-1 self-center">
          <p className="truncate text-xl font-semibold text-white">{character.name}</p>
          <p className="mt-1 text-sm text-abyss-mist">{klass?.name_localized ?? character.class_id}</p>
          <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-widest text-abyss-fog">
            <span className="font-mono text-abyss-mist">
              {t(locale, "hub.level", { level: character.level })}
            </span>
            <span aria-hidden>·</span>
            <span>
              {character.current_floor !== null
                ? t(locale, "hub.current_floor", { floor: character.current_floor })
                : t(locale, "hub.no_floor")}
            </span>
          </div>
        </div>
      </header>

      <button
        type="button"
        onClick={onDescend}
        className="w-full rounded-lg border border-abyss-khaos/60 bg-gradient-to-r from-abyss-khaos/30 via-abyss-khaos/40 to-abyss-ember/30 py-3 text-sm font-semibold uppercase tracking-widest text-white shadow-md shadow-abyss-khaos/20 transition hover:border-abyss-khaos hover:from-abyss-khaos/50 hover:via-abyss-khaos/60 hover:to-abyss-ember/50"
      >
        {t(locale, "hub.descend")}
      </button>

      <nav className="grid grid-cols-5 gap-1 rounded-lg border border-abyss-coal/80 bg-abyss-deep p-1">
        {(["character", "inventory", "bestiary", "shop", "map"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-1 py-2 text-[10px] font-semibold uppercase tracking-widest transition ${
              tab === id ? "bg-abyss-khaos/40 text-white" : "text-abyss-fog hover:bg-abyss-coal/60 hover:text-abyss-mist"
            }`}
          >
            {t(locale, `hub.tabs.${id}`)}
          </button>
        ))}
      </nav>

      <section className="rounded-lg border border-abyss-coal/80 bg-abyss-deep p-5">
        {tab === "character" ? <CharacterTab character={character} locale={locale} /> : null}
        {tab === "inventory" ? <Placeholder text={t(locale, "hub.placeholder_inventory")} /> : null}
        {tab === "bestiary" ? <Placeholder text={t(locale, "hub.placeholder_bestiary")} /> : null}
        {tab === "shop" ? <Placeholder text={t(locale, "hub.placeholder_shop")} /> : null}
        {tab === "map" ? <Placeholder text={t(locale, "hub.placeholder_map")} /> : null}
      </section>
    </div>
  );
}

function CharacterTab({ character, locale }: { character: CharacterRow; locale: Locale }) {
  return (
    <div className="space-y-4">
      <Bar
        label={t(locale, "hub.stats.hp")}
        current={character.hp_current}
        max={character.hp_max}
        color="bg-abyss-ember"
      />
      <Bar
        label={t(locale, "hub.stats.mp")}
        current={character.mp_current}
        max={character.mp_max}
        color="bg-abyss-soul"
      />
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <StatPill label={t(locale, "hub.stats.atk")} value={String(character.atk)} />
        <StatPill label={t(locale, "hub.stats.def")} value={String(character.def)} />
        <StatPill label={t(locale, "hub.stats.strength")} value={String(character.attr_strength)} />
        <StatPill label={t(locale, "hub.stats.agility")} value={String(character.attr_agility)} />
        <StatPill label={t(locale, "hub.stats.intelligence")} value={String(character.attr_intelligence)} />
        <StatPill label={t(locale, "hub.stats.spirit")} value={String(character.attr_spirit)} />
      </dl>
    </div>
  );
}

function Bar({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-widest text-abyss-fog">
        <span>{label}</span>
        <span className="font-mono text-abyss-mist">
          {current} / {max}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-abyss-void">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between rounded bg-abyss-void/60 px-3 py-1.5">
      <dt className="text-abyss-fog">{label}</dt>
      <dd className="font-mono font-semibold text-white">{value}</dd>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-abyss-mist">{text}</p>
    </div>
  );
}
