"use client";

import { useEffect, useState } from "react";

type AuthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; user: { firstName: string; username: string | null; isNew: boolean } }
  | { status: "error"; message: string };

export default function LandingClient() {
  const [state, setState] = useState<AuthState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    async function authenticate() {
      try {
        // @twa-dev/sdk only works inside the Telegram client; loaded dynamically
        // so the build doesn't try to evaluate `window.Telegram` server-side.
        const WebApp = (await import("@twa-dev/sdk")).default;
        try {
          WebApp.ready();
          WebApp.expand();
        } catch {
          // Outside Telegram (browser preview) — that's fine, initData will be empty.
        }

        const initData = WebApp.initData;
        if (!initData) {
          if (!cancelled) {
            setState({
              status: "error",
              message:
                "Esta mini-app debe abrirse desde Telegram. Toca el botón de menú de @AbyssKhaosBot.",
            });
          }
          return;
        }

        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "unknown" }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const body = (await res.json()) as {
          user: { firstName: string; username: string | null; isNew: boolean };
        };

        if (!cancelled) setState({ status: "ok", user: body.user });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Fallo de autenticación",
          });
        }
      }
    }

    void authenticate();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="rounded-lg border border-abyss-fog/40 bg-abyss-deep p-6 text-abyss-fog">
        <p className="text-sm uppercase tracking-widest">Sellando alma…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-abyss-ember/40 bg-abyss-deep p-6">
        <p className="text-xs uppercase tracking-widest text-abyss-ember">El abismo te rechaza</p>
        <p className="mt-3 text-sm text-abyss-fog">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-abyss-soul/40 bg-abyss-deep p-6">
      <p className="text-xs uppercase tracking-widest text-abyss-soul">
        {state.user.isNew ? "Nueva alma vinculada" : "Alma reconocida"}
      </p>
      <h2 className="mt-3 text-2xl font-bold">Bienvenido, {state.user.firstName}</h2>
      {state.user.username ? (
        <p className="mt-1 text-sm text-abyss-fog">@{state.user.username}</p>
      ) : null}
      <p className="mt-6 text-xs text-abyss-fog/80">
        El descenso comienza pronto. Próxima fase: creación de personaje.
      </p>
    </div>
  );
}
