"use client";

import { useEffect, useState } from "react";

import { CANONICAL_LOCALE, isSupportedLocale, pickLocale, t, type Locale } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";

const LOCALE_STORAGE_KEY = "abyss.locale";

type AuthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; user: { firstName: string; username: string | null; isNew: boolean } }
  | { status: "error"; message: string };

export default function LandingClient() {
  const [state, setState] = useState<AuthState>({ status: "idle" });
  const [locale, setLocale] = useState<Locale>(CANONICAL_LOCALE);

  // Decide initial locale: localStorage override > Telegram language_code > en.
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    async function init() {
      // localStorage override
      let chosen: Locale = CANONICAL_LOCALE;
      try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored && isSupportedLocale(stored)) chosen = stored;
      } catch {
        // ignored
      }

      // Telegram WebApp init
      const WebApp = (await import("@twa-dev/sdk")).default;
      try {
        WebApp.ready();
        WebApp.expand();
      } catch {
        // running outside Telegram preview — fine
      }

      // If no localStorage override, fall back to Telegram's language_code
      if (chosen === CANONICAL_LOCALE) {
        const tgLang = WebApp.initDataUnsafe?.user?.language_code;
        chosen = pickLocale(tgLang);
      }
      if (!cancelled) setLocale(chosen);

      const initData = WebApp.initData;
      if (!initData) {
        if (!cancelled) {
          setState({
            status: "error",
            message: t(chosen, "landing.must_open_in_telegram"),
          });
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: "unknown" }))) as {
            error?: string;
            detail?: string;
            debug?: unknown;
          };
          const msg = body.detail ?? body.error ?? `HTTP ${res.status}`;
          const dbg = body.debug ? `\n\n[DEBUG] ${JSON.stringify(body.debug, null, 2)}` : "";
          throw new Error(msg + dbg);
        }

        const body = (await res.json()) as {
          user: { firstName: string; username: string | null; isNew: boolean };
        };

        if (!cancelled) setState({ status: "ok", user: body.user });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Auth failed",
          });
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLocaleChange(next: Locale) {
    setLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LanguageSwitcher current={locale} onChange={handleLocaleChange} />
      </div>

      {state.status === "idle" || state.status === "loading" ? (
        <div className="rounded-lg border border-abyss-fog/40 bg-abyss-deep p-6 text-abyss-fog">
          <p className="text-sm uppercase tracking-widest">{t(locale, "landing.loading")}</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-lg border border-abyss-ember/40 bg-abyss-deep p-6">
          <p className="text-xs uppercase tracking-widest text-abyss-ember">
            {t(locale, "landing.rejected_title")}
          </p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-left font-mono text-[10px] leading-relaxed text-abyss-fog">
            {state.message}
          </pre>
        </div>
      ) : null}

      {state.status === "ok" ? (
        <div className="rounded-lg border border-abyss-soul/40 bg-abyss-deep p-6">
          <p className="text-xs uppercase tracking-widest text-abyss-soul">
            {state.user.isNew
              ? t(locale, "landing.new_soul_bound")
              : t(locale, "landing.soul_recognized")}
          </p>
          <h2 className="mt-3 text-2xl font-bold">
            {t(locale, "landing.welcome_named", { name: state.user.firstName })}
          </h2>
          {state.user.username ? (
            <p className="mt-1 text-sm text-abyss-fog">@{state.user.username}</p>
          ) : null}
          <p className="mt-6 text-xs text-abyss-fog/80">{t(locale, "landing.next_phase")}</p>
        </div>
      ) : null}
    </div>
  );
}
