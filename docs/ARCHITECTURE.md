# ABYSS: KHAOS DESCENT — Principios de arquitectura

> Este documento es **vinculante** para todo el código del repo. Cuando una
> decisión de implementación entre en conflicto con un principio aquí
> registrado, prevalece este documento. Los cambios se proponen vía PR con
> justificación.
>
> Última actualización: 2026-05-06 — pre-Fase 1.

## Pilares no negociables

1. **Server-authoritative gameplay.** El cliente nunca calcula daño, drops, ni
   transiciones de estado. Toda lógica que afecte progreso o economía vive en
   Edge Functions / Route Handlers verificando entrada y firmando salida.
2. **RLS por defecto.** Toda tabla nueva nace con `enable row level security`
   y políticas `using (false)` hasta que se diseñe explícitamente el acceso.
   El service-role solo se usa desde server; nunca llega al navegador.
3. **InitData verificado server-side.** El cliente envía el `initData` crudo;
   el server valida HMAC + edad antes de tocar la DB. Nunca confiamos en
   `Telegram.WebApp.initDataUnsafe` para autenticar.
4. **Migraciones forward-only.** Cada cambio de schema es un archivo nuevo en
   `supabase/migrations/<timestamp>_<slug>.sql`. No se edita una migración ya
   aplicada; se crea una nueva que rectifique.
5. **Activos por content-hash.** Los assets generados por PixelLab se suben a
   R2 con nombre `<hash>.<ext>` y se sirven con `Cache-Control: public,
   immutable, max-age=31536000`. Nunca se mutan in-place.
6. **Cuesta lo que cuesta, pero medido.** Toda función serverless tiene un
   presupuesto de DB roundtrips y latencia objetivo. No se hace deploy si una
   ruta supera el presupuesto sin justificación.

## Seguridad

### Modelo de amenazas (S1)

| Amenaza | Mitigación implementada / planificada |
|---|---|
| Cliente forja resultados de combate | Combate server-authoritative en Edge Function (Fase 4). El cliente solo manda `action_id` + `combat_state_id`; server retorna nuevo estado firmado. |
| Replay de `initData` | `auth_date` ≤ 24 h por defecto (configurable por env). HMAC constante en tiempo. |
| Filtración de service-role | Variable de entorno solo en runtime server. Verificación estática (lint rule futura) que prohíbe `import` de `lib/supabase/admin` desde `app/_components/`. |
| SQLi | Solo queries parametrizadas vía Supabase JS / SQL parametrizado. Nunca string concat. |
| Bots / scripts farmean recompensas | 5 capas (Fase 13): InitData + TonConnect + Turnstile + Redis rate-limit + captchas narrativos cada 45–90 min. |
| Robo de NFT al borrar cuenta | NFTs son Soulbound o transferibles a wallet del jugador antes de delete. Custodia documentada. |
| Concurrencia "primer jugador del servidor" | `INSERT INTO server_firsts (...) ON CONFLICT DO NOTHING` con timestamp tie-break. |
| XSS en datos de Telegram | Toda string de usuario sanitizada server-side; React escapa por defecto. |
| Frame-ancestors hijacking | CSP `frame-ancestors` limita a `t.me / *.telegram.org`. |
| Token leakage en logs | Logger redacta valores cuyas keys matchean `/token|key|secret|hash/i`. |

### Convenciones de credenciales

- Tokens production-grade rotados al final del proyecto.
- Service-role NUNCA en `NEXT_PUBLIC_*`.
- Telegram bot token solo en server.
- `.local-secrets/` en `.gitignore`; auditoría manual previa a cada commit.

## Escalabilidad

### Hot paths y diseño

| Hot path | Demanda esperada (S1, 100k DAU) | Diseño |
|---|---|---|
| Auth (`/api/auth/telegram`) | 100 RPS pico | Edge runtime; HMAC en Web Crypto; upsert single-row indexed by `telegram_id`. |
| Combat tick | 500 RPS pico | Edge Function; estado en Redis (TTL 5 min) + persistencia a Postgres en cierre de combate. |
| Vínculo offline tick | 100k bestias × 24 ticks/día = 2.4M ops/día | **Event-driven**: cada bestia genera N "intentos" en una tabla `bestia_events`; un job cada 1 h procesa lotes de 5k. NO cron-per-bestia. |
| Bestiario / catálogo | Miles RPS | Static-cached at Edge con `revalidateTag("catalog")`; mobs / items / sets se pre-render. |
| Marketplace listings | 50 RPS pico | Postgres view materializado refresh cada 30 s; lecturas van al view. |

### Convenciones de DB

- **PK `uuid` con `gen_random_uuid()`** en todas las tablas (no leak de orden de inserción, idempotencia de inserts retry).
- **`created_at` / `updated_at`** en toda tabla mutable; trigger universal `touch_updated_at`.
- **Foreign keys con `on delete restrict`** por defecto; `cascade` solo cuando es semánticamente correcto.
- **Índices upfront**: cualquier columna que aparezca en `where` o `join` se indexa en la migración que la introduce.
- **Vistas materializadas** para dashboards y rankings; refresh por job programado.
- **Particionado** (post-S1): `bestia_events`, `combat_log`, `loot_drops` particionados por `created_at` mensual cuando crucen 10M filas.
- **Connection pooling**: Vercel Edge → Supavisor (transaction mode). Nunca conexiones directas desde funciones cortas.

### Convenciones de API

- Toda ruta retorna JSON con shape `{ data: T } | { error: string, detail?: string }`.
- Errores incluyen `request_id` (header `X-Request-Id`).
- Rate-limiting por ruta + por usuario (Phase 13: Upstash Redis).
- Idempotencia: rutas mutables aceptan header `Idempotency-Key`; resultado cacheado 24 h.
- Versionado `/api/v1/...` desde Fase 1 para permitir breaking changes en S2/S3.

## Optimización (rendimiento)

### Frontend

- Phaser scene `dynamic(() => import(...), { ssr: false })` — el bundle del juego no bloquea el primer paint del HUB.
- Sprites en atlas (TexturePacker) — máx 6 atlas activos a la vez (Doc 5 §5).
- 30 FPS objetivo; partículas máx 50 simultáneas.
- `prefers-reduced-motion` reduce animaciones secundarias.
- `next/image` para retratos de NPCs y portadas; PixelArt sprites se sirven raw desde R2.

### Backend

- Funciones serverless ≤ 100 ms p50 en hot paths.
- Toda query con `EXPLAIN ANALYZE` antes de mergear si toca tablas con > 1M filas.
- Batch inserts (`upsert(..., { onConflict: ... })`) para escrituras múltiples.
- Evitamos N+1 con `select('..., joined_table(*)')` o vistas.

### Cliente Telegram

- Bundle inicial ≤ 100 kB JS. Phaser y Howler.js cargados solo cuando el HUB
  hace transición a juego.
- Audio iOS solo después de gesto (Doc 5 §6.3).
- RAM target < 150 MB.

## Observabilidad

- Logging estructurado (`pino` o equivalente) desde Fase 1.
- Request ID generado en middleware, propagado a Supabase via header.
- PostHog formal en Fase 13, pero **eventos básicos** desde Fase 4 (mob_killed, level_up, death, item_dropped, login).
- Alertas: error rate > 1% por 5 min → notificación.
- Sentry o similar para errores client-side (Fase 13).

## Testing

- **Crítico para criptografía y lógica de combate.** El bug `BAD_HMAC` se
  habría detectado con un test de roundtrip — añadir test ANTES de marcar la
  fase como hecha.
- Unit tests (vitest) para fórmulas de daño, drop tables, EXP curve.
- Integration tests para `/api/auth/telegram`, `/api/combat-action`, etc.
- Smoke test post-deploy: ping a `/api/health`, verifica DB response < 200 ms.
- CI bloquea merge si typecheck, lint o tests fallan.

## Disaster recovery

- Supabase Pro = PITR (Point-in-Time Recovery) 7 días.
- Snapshots diarios automáticos.
- Migraciones forward-only y commiteadas → reproducible cualquier estado.
- Procedimiento documentado de restore en `docs/RUNBOOK.md` (Fase 13).

## Costo

| Servicio | Plan S1 | Costo aprox |
|---|---|---|
| Vercel | Hobby (free) o Pro ($20/mes) | $0–20 |
| Supabase | Pro | $25 |
| Cloudflare R2 | Pay-as-go | $0–5 |
| Cloudflare Turnstile | Free | $0 |
| Upstash Redis + QStash | Free tier | $0 |
| PostHog | Free tier (1M events) | $0 |
| **Total S1** | | **$25–50** |

Cap de costo escalado: si pasamos $200/mes en S1, hay que rediseñar antes de
seguir gastando. Cada nueva integración requiere análisis de costo-por-DAU.

## Cuándo "parar y rediseñar"

- Una ruta supera 200 ms p95.
- Una query toca > 100k filas en producción.
- Una tabla supera 50M filas sin particionado.
- Un hot path alcanza 70% del ratelimit de Supabase.
- Un cron sufre overlap (job N+1 empieza antes que N termine).
