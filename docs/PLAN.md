# ABYSS: KHAOS DESCENT — Plan de fases

> Cada fase termina con: `pnpm typecheck && pnpm build` verde, un único commit
> en `main`, push a `https://github.com/bravoacamus-droid/abysskhaos.git`.
> El usuario despliega a Vercel a su criterio.

## Stack acordado (Doc 5)

- **Frontend**: Next.js 14 (App Router) · TypeScript estricto · Tailwind · Phaser 3 (lazy-loaded en `/play`) · Howler.js · TonConnect 2.0 · `@twa-dev/sdk`
- **Backend**: Supabase Pro (Postgres + RLS + Edge Functions Deno) · pg_cron · Upstash Redis (rate-limit, S2+) · Upstash QStash (jobs Vínculo, S2+)
- **CI**: GitHub Actions (typecheck + build + lint en cada push)
- **Deploy**: Vercel
- **Servicios diferidos**: Cloudflare R2 (assets, ~Fase 3) · Cloudflare Turnstile (Fase 13) · IPFS pinning (Fase 12)

## Fases

### Fase 0 — Cimientos / vertical slice end-to-end
- Repo Next.js 14 + TS + Tailwind + ESLint + Prettier
- Supabase client (browser + server) con env vars
- Telegram WebApp SDK + verificación InitData en Edge Function (firma HMAC)
- Schema mínimo: `users`, `telegram_accounts`, RLS básico
- Pantalla `/` que detecta InitData → upserta usuario → muestra "Bienvenido, {first_name}"
- GitHub Actions CI + README mínimo
- **Entregable demoable**: bot `/start` abre mini-app y autentica.

### Fase 1 — Datos canónicos + i18n (✅ shipped)
- 31 tablas canónicas (classes, paths, hybrid_classes, sub_branches, attributes, sub_attributes, items_master + sub-tables, sets, monsters/families/tiers, floors, biomes, cities, npcs, loot_tables, etc.) con RLS deny-all
- i18n: `supported_locales` (10 idiomas), `translations` table (entity_type + entity_id + locale + field), `users.preferred_locale`. **Inglés canónico** (Web3 lingua franca); español traducido al 100% en `translations`; 8 idiomas más con UI traducida.
- Seeds (309 filas + 444 traducciones): 8 elements · 17 status_effects · 7 rarity_tiers · 8 soul_forge_ranks · 4 damage_types · 6 currencies · 4 attributes + 20 sub_attributes · 5 classes + 15 paths + 10 hybrid_classes + 20 sub_branches · 10 biomes + 100 floors + 5 cities · 15 npcs · 16 monster_families + 6 monster_tiers + 8 sample monsters · 5 sample equipment_sets
- App i18n: `messages/{locale}.json` × 10, helper `lib/i18n` con `t()` typed + placeholder substitution, `LanguageSwitcher` UI con 10 idiomas
- Endpoint admin read-only `/api/v1/admin/data/[resource]` con API key, whitelist de 32 recursos
- 23/23 tests verde (HMAC roundtrip + i18n key parity + seed structure)

### Fase 2 — Creación de personaje
- Wizard 7 pasos (Doc 5)
- Multi-personaje (2 gratis, slots 3 y 4 con USDT pendiente)
- HUB con 5 tabs: Personaje, Inventario, Bestiario, Tienda, Mapa
- **Entregable**: crear personaje y verlo en HUB.

### Fase 3 — Mundo y exploración
- Generación procedural piso 100 (5 rooms iniciales para tutorial)
- Phaser scene `/play` con tilemap + movimiento entre rooms
- NPC: Cedric (tutorial + arma inicial)
- Asset pipeline R2 (PixelLab API integrada)
- **Entregable**: explorar piso 100 y hablar con Cedric.

### Fase 4 — Combate base server-authoritative
- Edge Function `combat-action` (acción → state firmado)
- Encuentro turn-based: atacar / item / huir
- 5 mobs Tier I sin elementos
- Recompensas: EXP, Khryn, drops Tier Común
- **Entregable**: derrotar 5 mobs y ganar EXP.

### Fase 5 — Inventario y equipamiento
- 10 slots, equipar/desequipar afecta stats
- Durabilidad + reparación Cedric
- Death Tax 30% off-chain en muerte
- Saqueo cuerpo (30 min, 60 si Enviado)
- **Entregable**: morir, perder ítems, recuperarlos.

### Fase 6 — Soul Forge MVP
- Action "Soul Seal" en combate
- Captura ≤15% HP (≤5% Élite — no aplica aún)
- Rangos F → E con bonus stat
- 1 alma por arma, 5 armas por personaje, 2 equipables
- **Entregable**: capturar Goblin y ver bonus en arma.

### Fase 7 — Progresión Nv 1–15 + Vías
- Curva EXP completa
- Asignación sub-stats (3 pts/nv)
- Elección Vía a Nv 15 (3 vías × 5 clases = 15 ramas)
- **Entregable**: subir a Nv 15 y elegir Vía.

### Fase 8 — Sistema elemental + Bestiario
- 8 elementos, tabla 8×8 (1.5× / 0.6×)
- Luz×2 vs Sombra
- Bestiario UI tipo Pokédex (kills 1/5/20)
- **Entregable**: matar mob por afinidad y consultar bestiario.

### Fase 9 — Loot completo + Tienda + Profesiones
- Drop tables por tier de mob
- Tienda Cedric (pociones, antorchas, esferas captura)
- Sub-stat Fortuna (+0.8% drops/punto)
- 8 profesiones (máx 2 activas)
- **Entregable**: comprar pociones, gastar Khryn.

### Fase 10 — Entidades del Abismo
- Guardián (1% trigger HP <50%)
- Enviado (2% al entrar room, combate sellado HP×5 ATK×1.2 DEF×0.8, cap 30 turnos)
- **Entregable**: encuentro Enviado funcional.

### Fase 11 — Vínculo Salvaje (event-driven)
- Crear vínculo (3 caminos)
- Tick por hora (no por minuto) en pg_cron
- Reportes loot diarios
- Altar Liberación (100K Khryn)
- **Entregable**: vincular bestia y recibir loot offline.

### Fase 12 — TonConnect + NFT minteo
- TonConnect 2.0 integrado
- Smart contract TEP-62 / TEP-64 deployado en testnet
- Minteo automático al equipar Épico+
- IPFS pinning de metadata
- **Entregable**: equipar Épico → NFT en wallet testnet.

### Fase 13 — Mini-bosses, anti-bot, telemetría
- Pisos 99–95 con mini-bosses
- Cloudflare Turnstile en login
- Rate limit Upstash Redis
- Captchas narrativos (45–90 min)
- PostHog telemetría (mob_killed, level_up, death, conversion funnel)
- **Entregable**: stats de juego visibles en dashboard.

### Fase 14+ (a planificar)
Pisos 94–71, Centinela Primordial, híbridos Nv 25 (10 combos × 2 sub-ramas), Prestige Nv 40 (15 títulos PP), sistema Legado completo (Tienda, Mercenario Guardián, Trampa), marketplace NFT con royalties, i18n EN/RU/PT.

## Convenciones de commit

`<scope>: <verbo en imperativo>` — `phase-0`, `phase-1`, etc.
Ejemplo: `phase-0: scaffold Next.js + Telegram WebApp + Supabase auth`.
