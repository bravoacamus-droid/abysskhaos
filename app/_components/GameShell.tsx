"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  fetchCharacters,
  fetchClasses,
  updatePreferredLocale,
  type CharacterRow,
  type ClassRow,
} from "@/lib/client/api";
import { CANONICAL_LOCALE, isSupportedLocale, pickLocale, t, type Locale } from "@/lib/i18n";

import CharacterCreate from "./CharacterCreate";
import Hub from "./Hub";
import LanguageSwitcher from "./LanguageSwitcher";

const LOCALE_STORAGE_KEY = "abyss.locale";

type State =
  | { status: "boot" }
  | { status: "rejected"; message: string }
  | { status: "wizard"; classes: ClassRow[] }
  | { status: "hub"; character: CharacterRow; classes: ClassRow[] };

export default function GameShell() {
  const [initData, setInitData] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>(CANONICAL_LOCALE);
  const [state, setState] = useState<State>({ status: "boot" });

  useEffect(() => {
    let cancelled = false;
    void boot();
    return () => {
      cancelled = true;
    };

    async function boot() {
      let chosenLocale: Locale = CANONICAL_LOCALE;
      try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored && isSupportedLocale(stored)) chosenLocale = stored;
      } catch {
        // ignore
      }

      const WebApp = (await import("@twa-dev/sdk")).default;
      try {
        WebApp.ready();
        WebApp.expand();
      } catch {
        // outside Telegram
      }

      if (chosenLocale === CANONICAL_LOCALE) {
        chosenLocale = pickLocale(WebApp.initDataUnsafe?.user?.language_code);
      }
      if (cancelled) return;
      setLocale(chosenLocale);

      const id = WebApp.initData;
      if (!id) {
        setState({
          status: "rejected",
          message: t(chosenLocale, "landing.must_open_in_telegram"),
        });
        return;
      }
      setInitData(id);

      try {
        // Auth: register/refresh the user row + capture preferred_locale.
        const authRes = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: id }),
        });
        if (!authRes.ok) {
          const body = (await authRes.json().catch(() => ({}))) as { error?: string; detail?: string };
          throw new ApiError(body.error ?? `HTTP_${authRes.status}`, body.detail, authRes.status);
        }

        // Pull catalog + character list in parallel.
        const [classes, characters] = await Promise.all([
          fetchClasses({ initData: id, locale: chosenLocale, signal: undefined }),
          fetchCharacters({ initData: id, signal: undefined }),
        ]);
        if (cancelled) return;

        if (characters.length === 0) {
          setState({ status: "wizard", classes });
        } else {
          // Pick the active slot — for now, the first slot.
          const character = characters[0]!;
          setState({ status: "hub", character, classes });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "rejected",
          message: humanize(err, chosenLocale),
        });
      }
    }
  }, []);

  // When the user changes locale via the switcher, persist to localStorage
  // and (best-effort) sync to the DB so future devices match.
  function handleLocaleChange(next: Locale) {
    setLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    if (initData) {
      // Fire-and-forget; failure here doesn't break the UX.
      updatePreferredLocale({ initData, locale: next, signal: undefined }).catch(() => {});
    }
  }

  const klassById = useMemo(() => {
    const map = new Map<string, ClassRow>();
    if (state.status === "wizard" || state.status === "hub") {
      for (const c of state.classes) map.set(c.id, c);
    }
    return map;
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LanguageSwitcher current={locale} onChange={handleLocaleChange} />
      </div>

      {state.status === "boot" ? (
        <Boot locale={locale} />
      ) : state.status === "rejected" ? (
        <Rejected message={state.message} locale={locale} />
      ) : state.status === "wizard" ? (
        <CharacterCreate
          initData={initData!}
          locale={locale}
          onCreated={(character) =>
            setState({ status: "hub", character, classes: state.classes })
          }
        />
      ) : (
        <Hub
          character={state.character}
          klass={klassById.get(state.character.class_id) ?? null}
          locale={locale}
        />
      )}
    </div>
  );
}

function Boot({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-lg border border-abyss-coal/80 bg-abyss-deep p-6 text-center text-abyss-mist">
      <p className="text-sm uppercase tracking-widest">{t(locale, "landing.loading")}</p>
    </div>
  );
}

function Rejected({ message, locale }: { message: string; locale: Locale }) {
  return (
    <div className="rounded-lg border border-abyss-ember/40 bg-abyss-deep p-6">
      <p className="text-xs uppercase tracking-widest text-abyss-ember">
        {t(locale, "landing.rejected_title")}
      </p>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-left font-mono text-[10px] leading-relaxed text-abyss-mist">
        {message}
      </pre>
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
