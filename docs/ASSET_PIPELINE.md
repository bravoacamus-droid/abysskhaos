# ABYSS: KHAOS DESCENT — Asset pipeline

> Vinculante para todo el arte del juego. Cualquier asset que entre al
> repositorio o a R2 debe pasar por este flujo. Última actualización:
> 2026-05-07.

## Fuente única: PixelLab.ai

PixelLab es la herramienta exclusiva de generación de arte para S1. Tier
contratado: **Pixel Artisan** (5,000 generaciones/mes incluidas + fallback
de créditos). API key vive en `.local-secrets/CREDENTIALS.md`.

**Dos vías de acceso:**

1. **MCP (preferido durante desarrollo)** — Claude Code se conecta directamente
   a `https://api.pixellab.ai/mcp` y expone 6 herramientas tipadas
   (`create_character`, `animate_character`, `create_topdown_tileset`,
   `create_sidescroller_tileset`, `create_isometric_tile`,
   `create_map_object`). Instalación una sola vez:
   ```bash
   claude mcp add pixellab https://api.pixellab.ai/mcp \
       -t http -H "Authorization: Bearer <PIXELLAB_API_KEY>"
   ```

2. **HTTP API directo** — para automatización en CI o para el runtime del juego
   (Fase 12 NFT variants). 8 endpoints documentados en `https://api.pixellab.ai/v2/docs`:
   - `/generate-image-pixflux` (texto → sprite, hasta 400×400)
   - `/generate-image-bitforge` (texto + referencia para style-match, hasta 200×200)
   - `/animate-with-skeleton` (4-frame con keypoints, hasta 256×256)
   - `/animate-with-text` (animación desde texto, fijo 64×64)
   - `/rotate` (4 u 8 direcciones, hasta 128×128)
   - `/inpaint` (edición con máscara, hasta 200×200)
   - `/estimate-skeleton` (keypoints de un sprite existente)
   - `/balance` (crédito restante)

## Resoluciones canónicas (Doc 5 §5)

| Asset type | Resolución | Endpoint preferido |
|---|---|---|
| Tile | 16×16 (×2 zoom) | `create_topdown_tileset` (Wang) |
| Sprite de batalla | 32×48 (×1.5) | `create_character` |
| Sprite mob común | 32–80 px | `create_character` |
| Sprite boss | 64–128 px | `create_character` (8 directions) |
| Background de room | 400×240 | `pixflux` |
| Guardián sprite | 120×160 | `pixflux` |
| Enviado sprite | 140×180 | `pixflux` |
| Ícono ítem | 32×32 | `create_map_object` |
| Retrato NPC | 96×96 | `pixflux` |

Restricciones de paleta del Doc 5: **máx 32 colores en uso**, **máx 4 sombras
por color base**. Estilo de referencia: *"FF VI × Chrono Trigger × Hollow
Knight × Octopath × Hades"*.

## Pipeline canónico

```
1. Generación (PixelLab MCP o API)
        │
        ▼
2. Cleanup opcional con Aseprite local
   (solo si el output necesita ajustes — no obligatorio)
        │
        ▼
3. Hash del contenido → SHA256 → filename = <hash>.png
        │
        ▼
4. Upload a Cloudflare R2 en `assets/<hash>.png`
   con Cache-Control: public, immutable, max-age=31536000
        │
        ▼
5. Persistir la URL pública de R2 en DB:
   - items_master.icon_path
   - monsters.sprite_path
   - npcs.portrait_path
   - floors.background_path
   - etc.
```

**Por qué content-hash:** los activos son inmutables. Si re-generamos un
sprite el hash cambia → la URL cambia → el cliente nunca ve un sprite
obsoleto en cache. Y la cache puede vivir un año (`max-age=31536000`)
sin riesgo.

## Convenciones de prompt

Para reproducibilidad, todo prompt enviado a PixelLab DEBE registrarse en
una tabla `asset_generations` (Fase 3) con:

```
generation_id      uuid
entity_type        text          -- 'monster', 'npc', 'item', ...
entity_id          text          -- slug del entity
prompt             text          -- el texto enviado
endpoint           text          -- 'pixflux', 'bitforge', etc.
size               text          -- '64x64'
seed               int           -- si aplica
output_hash        text          -- SHA256 del PNG resultante
output_r2_url      text
generated_at       timestamptz
generated_by       text          -- 'mcp' o 'api'
cost_credits_usd   numeric(7,4)  -- de la response.usage
```

Esto permite: (a) reproducir un asset, (b) auditar el costo total,
(c) debug visual cuando un sprite "se ve raro".

## Roadmap por fase

| Fase | Alcance | Estimado de imágenes |
|---|---|---|
| 2 | 5 retratos de clase + ~10 íconos UI básicos | ~15 |
| 3 | Tileset Threshold + 5 rooms piso 100 + Cedric sprite + props | ~40 |
| 4 | 5 mobs Tier I sprites + 5 animaciones (idle/attack/hurt/death/victory) | ~30 + 150 frames |
| 5 | Íconos de 10 slots de equipo + 5 ítems iniciales | ~15 |
| 8 | 8 efectos elementales + variantes elementales de Keese | ~20 |
| 10 | Sprite Guardián (120×160) + Enviado (140×180) | ~10 |
| 12 | **Pipeline runtime distinto**: variantes NFT (Holographic / Khaos-Touched / Soul-Marked) on-demand | miles |
| 13 | Wizzrobe Mayor / Rex Reptite / Iron Knuckle / Centinela Primordial | ~20 + animaciones |

**Total S1 ≈ 150 imágenes únicas + 150 frames** — caben con margen en 5,000/mes.

## Runtime vs build-time

- **Build-time** (default S1) — un asset se genera UNA vez durante desarrollo,
  se sube a R2 con su hash, y el juego sólo lo sirve. Cero costo en runtime.
- **Runtime** (Fase 12 NFT only) — para variantes procedurales únicas
  (7,200 variantes/arma según Doc 9). El sistema:
  1. Player drops un Épico+
  2. Worker job (Upstash QStash) llama PixelLab en background
  3. Genera variante con seed estable derivada del item_id
  4. Pin en IPFS para metadata NFT
  5. Mintea on-chain
  Total esperado: ~$0.01 por mint.

## Costos vigilados

Por `docs/ARCHITECTURE.md` §Costo: si el gasto mensual de PixelLab supera
$50 USD (≈ 6,000 generaciones a precios de hoy), revisar el pipeline antes
de generar más. La memoria cache de R2 + content-hash debería hacer que el
total mensual recurrente sea cercano a $0.

## Trabajo de Aseprite (opcional)

Aseprite NO es obligatorio. Solo se usa cuando un sprite necesita:
- Limpiar pixeles aislados
- Forzar paleta exacta a la del bioma
- Recortes de transparencia
- Componer un atlas con TexturePacker

Si Aseprite cambia el sprite, el hash cambia → nueva URL en R2.
