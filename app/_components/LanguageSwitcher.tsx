"use client";

import { useState } from "react";
import { LOCALE_INFO, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

type Props = {
  current: Locale;
  onChange: (next: Locale) => void;
};

export default function LanguageSwitcher({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const info = LOCALE_INFO[current];

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="rounded-md border border-abyss-coal/80 bg-abyss-deep px-3 py-1.5 text-xs uppercase tracking-widest text-abyss-mist transition hover:border-abyss-soul/60 hover:text-white"
      >
        {info.native}
        <span className="ml-2 text-abyss-fog">▾</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Language"
          className="absolute right-0 z-20 mt-1 max-h-72 w-44 overflow-auto rounded-md border border-abyss-coal/80 bg-abyss-deep py-1 text-left shadow-2xl shadow-black/60"
        >
          {SUPPORTED_LOCALES.map((loc) => {
            const meta = LOCALE_INFO[loc];
            const selected = loc === current;
            return (
              <li key={loc} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(loc);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                    selected
                      ? "bg-abyss-khaos/40 text-white"
                      : "text-abyss-mist hover:bg-abyss-coal/60 hover:text-white"
                  }`}
                >
                  <span>{meta.native}</span>
                  <span className="text-[10px] text-abyss-fog">{loc.toUpperCase()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
