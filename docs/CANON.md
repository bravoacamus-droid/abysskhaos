# ABYSS: KHAOS DESCENT — Decisiones canónicas

> Este documento resuelve las **inconsistencias críticas** detectadas al cruzar
> los 13 documentos `ABYSS_MASTER_*.docx`. Cuando un sistema implementado en
> código entre en conflicto con un documento original, la decisión registrada
> aquí prevalece. Los docs originales no se eliminan: se versionarán en `v2.0`
> tras la S1.
>
> Última actualización: 2026-05-06 — pre-Fase 0.

---

## 1. Soul Forge — número de rangos

**Conflicto:** Doc 1 §1.1 dice "9 rangos"; Doc 2 §4.1 lista 8 (F → E → D → C → B → A → S → SS Omega).

**Decisión:** **8 rangos.** El "9º rango" del Doc 1 es un error de redacción; la tabla detallada del Doc 2 es la fuente.

```
F (0–20 batallas)        +10%  bonus stat
E (21–60)                +25%
D (61–150)               +50%
C (151–400)              +75%
B (401–900)             +100%   primer Despertar
A (901–1,800)           +125%
S (1,801–3,000)         +150%   Despertar S
SS Omega (3,001+)       +200%   Omega final
```

## 2. Slots de equipamiento

**Conflicto:** Doc 4 §2.1 = 10 slots; Doc 7B §1 = 6 slots.

**Decisión:** **10 slots totales** en el personaje. Los **6 slots de armadura** son un subconjunto (no contradicción).

| # | Slot | Categoría | Tier mínimo NFT |
|---|---|---|---|
| 1 | Cabeza | Armadura | Épico |
| 2 | Pecho | Armadura | Épico |
| 3 | Brazos | Armadura | Épico |
| 4 | Piernas | Armadura | Épico |
| 5 | Botas | Armadura | Épico |
| 6 | Mano D | Arma principal | Épico |
| 7 | Mano I | Arma sec / escudo | Épico |
| 8 | Anillo 1 | Accesorio | Épico |
| 9 | Anillo 2 | Accesorio | Épico |
| 10 | Amuleto | Accesorio | Épico |

(Doc 7B se refiere implícitamente a los 6 cubiertos por **armadura**: Cabeza, Pecho, Brazos, Piernas, Botas, Mano I cuando es escudo.)

## 3. Captura de Élites — solo Alquimista

**Conflicto:** Doc 1 §1.2 dice "solo Alquimista captura Élites Talla L"; Doc 2 §3.5 todavía dice "Solo Hunter / Alquimista".

**Decisión:** **Solo Alquimista** captura mobs Élite (Tier IV). Hunter ya no figura como alternativa. Doc 2 será corregido en v2.0.

| Tier | Quién puede capturar |
|---|---|
| I/II/III (Común–Raro) | Cualquier clase con arma compatible |
| IV (Élite) | **Solo Alquimista** vía Soul Seal a ≤5% HP |
| V (Boss / World Boss) | **Nadie** — los bosses no son capturables |

## 4. Bestiario — recuento canónico

**Conflicto:** Doc 1 dice "180+"; Doc 10 lista 69 fichas con stats.

**Decisión:** **69 criaturas canónicas** con stats fijos + variantes procedurales (palette swaps, modifiers de zona, élites de mob común). El "180+" del Doc 1 es la suma de fichas + variantes generadas — válido como cifra de marketing pero no como cantidad de assets a producir.

## 5. Títulos PP-III Únicos

**Conflicto:** Doc 9 §1.3 = 18; Doc 9 §3.5 tabla = 19; Doc 1 / Doc 9 §2.2 = 35.

**Decisión:** **35 títulos Únicos PP-III** = 15 base (Doc 6A) + 20 sub-ramas híbridas (Doc 6B). Cada uno otorga **1 ítem Único Soulbound** "solo el primer jugador del servidor". Las cifras 18 / 19 son revisiones obsoletas y se corrigen.

## 6. NPCs permanentes vs viajeros

**Conflicto:** Doc 4 §1 título "7 rostros" pero §1.8 añade 8 viajeros.

**Decisión:** Modelo de dos categorías:

- **NPCs permanentes (7):** Cedric el Errante, Lyra Soul-Singer, Padre Ánima, Vex el Fundidor, Madre del Pacto, Voz del Vacío, Maestro de la Gran Obra.
- **NPCs viajeros (8):** rotan por pisos según calendario; no siempre disponibles.

Tabla `npcs.is_permanent BOOLEAN` en DB.

## 7. Estados negativos canónicos (los "6")

**Conflicto:** Doc 1 (Plaga Total) habla de "los 6 estados negativos"; en el GDD se mencionan 13+ sin distinción.

**Decisión:** **6 estados canónicos** (los que cuentan para Plaga Total y mecánicas que dicen "todos los estados"):

| Código | Nombre | Efecto base | Duración |
|---|---|---|---|
| `BURN` | Quemadura | -3% HP/turno | 4 turnos |
| `POISON` | Veneno | -2% HP/turno | 5 turnos |
| `BLEED` | Sangrado | -4% HP/turno (al moverse) | 4 turnos |
| `STUN` | Aturdido | Pierde 1 turno | 1 turno |
| `PARALYSIS` | Paralizado | 50% chance perder turno | 3 turnos |
| `CURSE` | Maldición | -25% stats primarios | 5 turnos |

Otros estados existentes (Confusión, Silenciado, Miedo, Dormido, Frío, etc.) son **debuffs especiales** que NO cuentan para mecánicas que se refieren a "los 6 estados negativos".

---

## Cambios pendientes (no críticos pero seguidos)

- **[med] Cero Tiempo (Hoja Trascendente Prestige):** Doc 1 dice 4 turnos; Doc 6A/8 dice 3 turnos. **Decisión: 3 turnos.**
- **[med] Sets de bioma:** validar caso por caso si son 5 o 6 piezas (sin escudo = 5).
- **[med] Centinela Primordial vs Guardián del Abismo:** son entidades distintas. En código: `centinela_primordial` (boss S1 piso 71) y `guardian_del_abismo` (referencia narrativa, no entidad).
- **[low] Estilo visual de referencia:** se adopta el del Doc 5: *"FF VI × Chrono Trigger × Hollow Knight × Octopath × Hades"*.

---

## Política de cambio

- Cambios a este documento se hacen **solo** vía PR con justificación.
- Cuando un sistema implementado entre en conflicto, este doc es la verdad; los `.docx` originales se mantienen como referencia histórica.
- Versionado: `v1.0` (pre-Fase 0) → se actualizará al final de cada Fase si se descubren nuevas inconsistencias.
