# DESTINY ENGINE — Creación de personaje (isekai "segunda oportunidad")

> El jugador muere en el mundo real y entra al juego. El **destino** (server-side) le asigna su build a partir de un **cuestionario de 3 preguntas**. El cliente solo manda las respuestas; el servidor calcula pesos, tira con su propia semilla y persiste. Cliente hostil asumido.
>
> **Entitlement:** free = 1 personaje · pago = 3. Server-enforced.
> **i18n:** todas las etiquetas (clases, elementos, ocupaciones, hobbies, pasivas) entran con clave es-canónica desde día 1.

## Cuestionario
1. **Fecha de nacimiento** → zodíaco chino + banda de edad
2. **Ocupación** (categorías generales, abajo)
3. **Hobby / actividad favorita** (categorías generales, abajo)

## Las 6 tiradas del destino
| Resultado | Fuente | Mecánica |
|---|---|---|
| **Clase** | cuestionario | pesos sobre {STR,VIT,AGI,INT,SPI} → tirada ponderada |
| **Elemento** | independiente | random con tiers de rareza |
| **Acompañante** | ocupación + hobby | par de 2 distintos → **50/50** |
| **Arma inicial** | derivada de la clase | random uniforme entre las armas iniciales de la clase |
| **Atributos** | independiente | random dentro de rangos por clase |
| **Pasiva del renacido** | cuestionario | pesos → tirada ponderada (1 de 12) |

---

## 1. Clase

5 clases base (Doc 6A), par de atributos primarios:

| Clase | Primarios | Armas iniciales (roll uniforme) |
|---|---|---|
| Guerrero | STR+VIT | Espada1H+Escudo · Hacha1H+Escudo · Espada2H · Hacha2H |
| Espadachín | STR+AGI | Espada1H · Espada2H |
| Asesino | AGI+INT | Dagas · Espadas duales |
| Infiltrador | AGI+INT | Pistola · Arco · Daga corta |
| Mago | INT+SPI | Grimorio · Bastón |

*(Las demás armas favorables documentadas de cada clase se desbloquean en sus clases evolutivas. Regla 2H↔off-hand: los 2H salen sin escudo; los 1H de Guerrero traen escudo.)*

### Fórmula
Cada respuesta aporta a un vector de tendencia **T = {STR, VIT, AGI, INT, SPI}** y a un **lean L ∈ [−1,+1]** (+1 = distancia/tecnología → Infiltrador, −1 = melee/sigilo → Asesino).

```
g  = T.STR + T.VIT            # Guerrero
e  = T.STR + T.AGI            # Espadachín
m  = T.INT + T.SPI            # Mago
ai = T.AGI + T.INT            # bucket compartido (Asesino/Infiltrador)

L  = promedio(L_ocupación, L_hobby)
infiltrador = ai * (0.5 + 0.5·L)
asesino     = ai * (0.5 − 0.5·L)

P(clase) = normalizar { g, e, m, infiltrador, asesino } → tirada ponderada
```

---

## 2. Zodíaco → tendencia (+2 primario / +1 secundario)
| Animal | Tendencia |  | Animal | Tendencia |
|---|---|---|---|---|
| 🐀 Rata | INT+2, AGI+1 |  | 🐎 Caballo | AGI+2, STR+1 |
| 🐂 Buey | VIT+2, STR+1 |  | 🐐 Cabra | SPI+2, INT+1 |
| 🐅 Tigre | STR+2, AGI+1 |  | 🐒 Mono | AGI+2, INT+1 |
| 🐇 Conejo | AGI+2, SPI+1 |  | 🐓 Gallo | INT+2, AGI+1 |
| 🐉 Dragón | STR+2, INT+1 |  | 🐕 Perro | VIT+2, STR+1 |
| 🐍 Serpiente | INT+2, SPI+1 |  | 🐖 Cerdo | VIT+2, SPI+1 |

## 3. Banda de edad → tendencia (juego 13+)
| Banda | Tendencia |  | Banda | Tendencia |
|---|---|---|---|---|
| 13–17 | AGI+1, STR+1 |  | 35–49 | INT+1, VIT+1 |
| 18–24 | AGI+1, INT+1 |  | 50–64 | INT+1, SPI+1 |
| 25–34 | STR+1, INT+1 |  | 65+ | SPI+1, VIT+1 |

---

## 4. Ocupación → tendencia · L · acompañantes
| Ocupación | Tendencia | L | Acompañantes (#1 · #2) |
|---|---|---|---|
| Estudiante | INT+1, AGI+1 | +0.3 | Owlet · Kitten Spirit |
| Comerciante | AGI+1, INT+1 | +0.2 | Imp · Serpent |
| Empresario | INT+1, STR+1 | +0.3 | Drake · Lion Cub |
| Sin ocupación | neutral | 0 | Slime · Demon |
| Artista | SPI+1, INT+1 | 0 | Fairy · Sprite |
| Ingeniero / Técnico | INT+1, STR+1 | +0.6 | Mecha · Crystal Familiar |
| Científico / Investigador | INT+1, SPI+1 | +0.5 | Owlet · Wisp |
| Médico / Salud | INT+1, SPI+1 | +0.1 | Wisp · Horse Angel |
| Programador / TI | INT+2 | +0.8 | Mecha · Bat |
| Docente / Profesor | INT+1, SPI+1 | 0 | Owlet · Sprite |
| Militar / Seguridad | STR+1, VIT+1 | +0.4 | Wolf Pup · Bear Cub |
| Atleta / Deportista | STR+1, AGI+1 | −0.5 | Lion Cub · Dinosaur |
| Obrero / Construcción | STR+1, VIT+1 | −0.4 | Boar · Bear Cub |
| Agricultor / Campo | VIT+1, SPI+1 | −0.3 | Boar · Horse Dark |
| Abogado / Político | INT+1, AGI+1 | +0.2 | Serpent · Drake |
| Funcionario / Oficina | INT+1, SPI+1 | +0.2 | Crystal Familiar · Slime |
| Chef / Gastronomía | AGI+1, VIT+1 | 0 | Slime · Phoenix Chick |
| Músico / Escénico | SPI+1, AGI+1 | 0 | Fairy · Phoenix Chick |
| Escritor / Periodista | INT+1, SPI+1 | 0 | Owlet · Bat |
| Diseñador / Creativo | INT+1, AGI+1 | +0.2 | Kitten Spirit · Fairy |
| Conductor / Transporte | VIT+1, AGI+1 | +0.2 | Horse Dark · Aerodactyl |
| Religioso / Espiritual | SPI+1, VIT+1 | 0 | Horse Angel · Wisp |
| Aventurero / Independiente | STR+1, AGI+1 | 0 | Aerodactyl · Demon |

## 5. Hobby → tendencia · L · acompañantes
| Hobby | Tendencia | L | Acompañantes (#1 · #2) |
|---|---|---|---|
| Deporte | STR+1, AGI+1 | −0.5 | Lion Cub · Dinosaur |
| Dibujar / Pintar | SPI+1, INT+1 | 0 | Fairy · Sprite |
| Videojuegos | INT+1, AGI+1 | +0.6 | Crystal Familiar · Drake |
| Programar | INT+2 | +0.8 | Mecha · Crystal Familiar |
| Leer | INT+1, SPI+1 | 0 | Owlet · Wisp |
| Escribir | INT+1, SPI+1 | 0 | Owlet · Bat |
| Música / Tocar | SPI+1, AGI+1 | 0 | Fairy · Phoenix Chick |
| Bailar | AGI+1, SPI+1 | −0.2 | Kitten Spirit · Fairy |
| Cocinar | AGI+1, VIT+1 | 0 | Slime · Phoenix Chick |
| Viajar | AGI+1, INT+1 | +0.3 | Aerodactyl · Horse Dark |
| Meditar / Yoga | SPI+1, VIT+1 | 0 | Wisp · Horse Angel |
| Cine / Series | INT+1, SPI+1 | +0.2 | Bat · Slime |
| Fotografía | AGI+1, INT+1 | +0.3 | Falcon · Kitten Spirit |
| Tiro / Puntería | AGI+1, INT+1 | +0.9 | Falcon · Wolf Pup |
| Artes marciales | STR+1, AGI+1 | −0.7 | Dinosaur · Lion Cub |
| Coleccionar | INT+2 | 0 | Crystal Familiar · Owlet |
| Ajedrez / Estrategia | INT+2 | +0.2 | Serpent · Owlet |
| Jardinería | SPI+1, VIT+1 | −0.2 | Sprite · Bear Cub |
| Vida social / Fiesta | AGI+1, SPI+1 | +0.2 | Bat · Imp |
| Esoterismo / Tarot | SPI+1, INT+1 | 0 | Demon · Wisp |
| Astronomía / Ciencia | INT+1, SPI+1 | +0.3 | Wisp · Crystal Familiar |
| Naturaleza / Aire libre | VIT+1, STR+1 | −0.3 | Bear Cub · Wolf Pup |

## 6. Acompañante — resolución
```
A = acompañante #1 de la OCUPACIÓN
B = acompañante #1 del HOBBY
si A == B  →  B = acompañante #2 del HOBBY
si A == B (aún)  →  A = acompañante #2 de la OCUPACIÓN
par {A, B}  →  tirada 50/50
```
Ocupación y hobby siempre aportan; nunca coinciden; siempre es azar 50/50. Las 23 familias quedan cubiertas entre ambas tablas.

## 7. Elemento (independiente, tiers de rareza)
| Elemento | Prob |
|---|---|
| 🔩 Metal | 2% |
| 🌑 Oscuridad | 5% |
| ✨ Luz | 8% |
| 🔥 Fuego · 💧 Agua · 🌳 Madera · ⛰️ Tierra · 🌬️ Aire · ⚡ Trueno | 14.17% c/u |

## 8. Atributos (random por clase)
Random dentro de rangos por clase: rango más alto en el par primario de la clase, más bajo en el resto. Los valores exactos de cada rango se toman de los stats base documentados de cada clase al implementar.

## 9. Pasiva del renacido (1 de 12)
Elegida por las combinaciones del cuestionario (mismo enfoque ponderado que la clase). Cada pasiva tiene **10 rangos**; sube hasta tope a Nv10, crecimiento lineal por rango.

| # | Pasiva | Efecto | Inicio (R1) | Máx (R10) |
|---|---|---|---|---|
| 1 | Golpe Certero | +crítico | +1% | +5% |
| 2 | Coraza Espiritual | −daño recibido | −1% | −5% |
| 3 | Reflejo del Renacido | +evasión (esquiva golpe completo) | +1% | +5% |
| 4 | Lazo de Almas | +efectividad del acompañante | +2% | +15% |
| 5 | Fortuna del Renacido | +khryn (enemigos y ventas) | +1% | +10% |
| 6 | Codicia del Destino | +prob. drop de rareza | +2% | +10% |
| 7 | Forjador Innato | +éxito Soul Forge / captura | +2% | +10% |
| 8 | Memoria de Vidas | +XP ganada | +3% | +10% |
| 9 | Núcleo Elemental | +daño con tu elemento | +2% | +10% |
| 10 | Hambre Vital | robo de vida (% daño infligido) | +1% | +5% |
| 11 | Viajero Etéreo | +prob. huir / −encuentros no deseados | +3% | +15% |
| 12 | Flujo de Maná | −costo de MP de habilidades | −2% | −15% |

## 10. Calibración (pre-release)
Simulación Monte-Carlo sobre la distribución real de respuestas, ajustando constantes hasta que:
- la **distribución marginal de las 5 clases** quede ~uniforme;
- la **frecuencia marginal de las 23 familias de pet** quede ~pareja (ponderada por popularidad de respuesta);
- la **distribución de las 12 pasivas** quede ~pareja.

Las respuestas inclinan al individuo; la población queda balanceada.
