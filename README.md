# ABYSS: KHAOS DESCENT

Telegram Mini App RPG sobre TON. Desciende del piso 100 al piso 1.

## Stack

- Next.js 14 · TypeScript · Tailwind
- Supabase (Postgres + RLS + Edge Functions)
- Telegram WebApp SDK (`@twa-dev/sdk`)
- Vercel (deploy)

## Documentos clave

- [`docs/PLAN.md`](docs/PLAN.md) — plan por fases del desarrollo.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — principios vinculantes de arquitectura, seguridad, escalabilidad y costo.
- [`docs/CANON.md`](docs/CANON.md) — decisiones canónicas que resuelven inconsistencias entre los 13 docs maestros.

## Estado actual

**Fase 0 — cimientos / vertical slice end-to-end.**

El bot `/start` abre la mini-app, ésta envía `initData` a `/api/auth/telegram`,
el server verifica el HMAC con el bot token, hace upsert del usuario en
Supabase y devuelve un saludo personalizado.

## Setup local

```bash
pnpm install
cp .env.example .env.local
# Rellena TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev
```

## Deploy a Vercel

1. Importa el repo `abysskhaos` en Vercel.
2. Configura las env vars (ver `.env.example`).
3. Tras el primer deploy, en BotFather:
   - `/newapp` o `/myapps` → vincula el bot `@AbyssKhaosBot` con la URL de Vercel.
   - `/setmenubutton` → texto: "Descender", URL: la del web app.

## Migrations Supabase

```bash
# Con la CLI de Supabase apuntando al proyecto:
supabase db push
# O ejecuta supabase/migrations/20260506000000_init.sql directamente en el SQL editor.
```

## Verificación

```bash
pnpm typecheck
pnpm lint
pnpm build
```
