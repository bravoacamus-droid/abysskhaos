/**
 * Post-onboarding "destiny reveal" intro copy — the narrative shown above each
 * spotlight (why your ELEMENT chose you, who your COMPANION is, what your DON
 * grants). es is canonical (USER-reviewed); en is the MVP fallback. Other
 * locales fall back to en, then es (added later via the normal i18n pass).
 *
 * Keyed by the same ids as elements/companions/passives. Single source for the
 * reveal screen — edit here to retune the voice.
 */

type Bi = { es: string; en: string };

export const ELEMENT_INTROS: Record<string, Bi> = {
  fire: {
    es: "El Fuego te ha elegido porque tu voluntad nunca aprendió a apagarse. Donde otros se rinden, tú ardes más fuerte; tu segunda vida nace, como toda llama, de las cenizas de la primera.",
    en: "Fire chose you because your will never learned to go out. Where others surrender, you burn brighter; your second life is born, like every flame, from the ashes of the first.",
  },
  water: {
    es: "El Agua te ha elegido por tu calma profunda. Sabes ceder sin romperte y rodear cada obstáculo hasta desgastarlo; tu fuerza no grita, fluye.",
    en: "Water chose you for your deep calm. You yield without breaking and flow around every obstacle until it wears away; your strength does not shout — it flows.",
  },
  wood: {
    es: "La Madera te ha elegido porque haces crecer la vida a tu alrededor. Paciente y tenaz, echas raíces donde otros solo ven piedra.",
    en: "Wood chose you because you make life grow around you. Patient and tenacious, you take root where others see only stone.",
  },
  metal: {
    es: "El Metal te ha elegido por tu temple. Pocos cargan un alma tan forjada: disciplina, filo y una resolución que atraviesa cualquier defensa.",
    en: "Metal chose you for your temper. Few carry so forged a soul: discipline, edge, and a resolve that pierces any defense.",
  },
  earth: {
    es: "La Tierra te ha elegido por tu firmeza. Eres el muro tras el cual otros se refugian: inamovible, paciente y leal.",
    en: "Earth chose you for your steadfastness. You are the wall others shelter behind: unmoving, patient, and loyal.",
  },
  wind: {
    es: "El Aire te ha elegido por tu espíritu libre. Veloz e inquieto, no hay jaula que te contenga; te mueves donde quieres y haces a un lado al destino.",
    en: "Wind chose you for your free spirit. Swift and restless, no cage can hold you; you move where you please and push fate aside.",
  },
  lightning: {
    es: "El Trueno te ha elegido por tu chispa. Piensas y golpeas en el mismo instante; brillante y decidido, iluminas la oscuridad antes de que sepa que llegaste.",
    en: "Lightning chose you for your spark. You think and strike in the same instant; brilliant and decisive, you light the dark before it knows you arrived.",
  },
  light: {
    es: "La Luz te ha elegido por la esperanza que llevas dentro. Guías a otros en lo más profundo del abismo y tu fulgor es el único que hace retroceder a las sombras.",
    en: "Light chose you for the hope you carry. You guide others through the deepest abyss, and your radiance alone makes the shadows recoil.",
  },
  shadow: {
    es: "La Oscuridad te ha elegido porque no temes lo que otros evitan. Abrazas el secreto y la profundidad, y de las sombras tomas la fuerza que drena a tus enemigos.",
    en: "Shadow chose you because you do not fear what others avoid. You embrace secrets and depths, and from the dark you draw the strength that drains your foes.",
  },
};

export const COMPANION_INTROS: Record<string, Bi> = {
  drake: {
    es: "Un draco de sangre ardiente te eligió como su llama gemela: orgulloso, leal y temible cuando ruge a tu lado.",
    en: "A fire-blooded drake chose you as its twin flame: proud, loyal, and fearsome when it roars at your side.",
  },
  wisp: {
    es: "Un sereno espíritu de luz se acercó a tu alma para sanarla; donde vayas, su brillo calmo te acompañará.",
    en: "A serene light-spirit drew near to heal your soul; wherever you go, its calm glow will follow.",
  },
  lion_cub: {
    es: "Un cachorro de diente de sable, fiero pese a su tamaño, vio en ti el valor que él mismo promete llegar a tener.",
    en: "A saber-tooth cub, fierce despite its size, saw in you the courage it promises one day to grow into.",
  },
  sprite: {
    es: "Un hada-hoja del bosque te adoptó; cuida la vida que la rodea y hará florecer la tuya.",
    en: "A leaf-fairy of the woods adopted you; it tends the life around it, and will make yours bloom.",
  },
  crystal_familiar: {
    es: "Un constructo de cristal arcano calculó mil futuros y en todos te eligió a ti; analítico y fiel, piensa contigo.",
    en: "An arcane crystal construct calculated a thousand futures and chose you in every one; analytical and faithful, it thinks alongside you.",
  },
  imp: {
    es: "Un diablillo travieso de las sombras se prendó de tu astucia; hará trampas, sí, pero siempre de tu lado.",
    en: "A mischievous shadow imp took a liking to your cunning; it will cheat, yes — but always on your side.",
  },
  owlet: {
    es: "Un búho sabio, mitad viento y mitad luz, descendió a posarse en tu hombro: paciente guía de quien sabe escuchar.",
    en: "A wise owl, half wind and half light, settled on your shoulder: a patient guide for those who listen.",
  },
  wolf_pup: {
    es: "Un cachorro de huargo blanco, de ojos de hielo, juró lealtad a tu manada de uno; donde estés, ahí estará.",
    en: "A white dire-wolf pup with eyes of ice swore loyalty to your pack of one; wherever you are, it will be.",
  },
  slime: {
    es: "Un slime relajado se pegó a tu sombra; simple, adaptable y sorprendentemente difícil de derrotar.",
    en: "An easygoing slime stuck to your shadow; simple, adaptable, and surprisingly hard to put down.",
  },
  phoenix_chick: {
    es: "Un polluelo de fénix, que ya conoce la muerte y el renacer, eligió acompañar a otro que también volvió.",
    en: "A phoenix chick, already acquainted with death and rebirth, chose to walk with another who came back too.",
  },
  mecha: {
    es: "Un autómata metódico te seleccionó como su operador; preciso e incansable, ejecuta cada orden con lealtad mecánica.",
    en: "A methodical automaton selected you as its operator; precise and tireless, it carries out every order with mechanical loyalty.",
  },
  kitten_spirit: {
    es: "Un gato astral con una luna en la frente cruzó del otro lado solo para jugar —y velar— a tu lado.",
    en: "An astral kitten with a moon on its brow crossed over just to play — and watch over you.",
  },
  bat: {
    es: "Un murciélago tímido de la noche confió en ti antes que en nadie; pequeño, leal y más valiente de lo que aparenta.",
    en: "A shy night bat trusted you before anyone; small, loyal, and braver than it looks.",
  },
  falcon: {
    es: "Un halcón preciso de los cielos te escogió como su tierra firme; veloz, certero, tus ojos en las alturas.",
    en: "A precise sky-falcon chose you as its solid ground; swift and unerring, your eyes on high.",
  },
  aerodactyl: {
    es: "Un pterosaurio primigenio, audaz como el viento y duro como el metal, batió sus alas hacia ti sin temer la altura.",
    en: "A primeval pterosaur, daring as the wind and hard as metal, beat its wings toward you, fearing no height.",
  },
  bear_cub: {
    es: "Un panda dormilón, tierno y testarudo, despertó apenas lo justo para elegirte; protector tras su modorra.",
    en: "A sleepy panda, tender and stubborn, woke just enough to choose you; a protector behind the drowsiness.",
  },
  fairy: {
    es: "Un hada soñadora te encontró entre mundos; mágica y gentil, teje suerte a tu alrededor.",
    en: "A dreamy fairy found you between worlds; magical and gentle, it weaves luck around you.",
  },
  serpent: {
    es: "Una serpiente paciente, estratega de veneno, se enroscó a tu destino esperando el momento perfecto.",
    en: "A patient serpent, a strategist of venom, coiled around your fate to await the perfect moment.",
  },
  demon: {
    es: "Un demonio de poder oscuro, intenso y leal a su pacto, te eligió como amo; teme a sus enemigos, no a él.",
    en: "A demon of dark power, intense and true to its pact, chose you as its master; fear its enemies, not it.",
  },
  horse_angel: {
    es: "Un corcel enmascarado, de ojos de pura luz y casco de trueno, se arrodilló ante ti; noble montura de los renacidos.",
    en: "A masked steed, eyes of pure light and hooves of thunder, knelt before you; a noble mount for the reborn.",
  },
  horse_dark: {
    es: "Una pesadilla de fuego oscuro, con cuerno y pezuñas de fragua, galopó desde las sombras para ser tuya.",
    en: "A nightmare of dark fire, horned and forge-hooved, galloped out of the shadows to be yours.",
  },
  dinosaur: {
    es: "Un raptor feroz, rápido como el rayo que aún no aprende a invocar, reconoció en ti a su líder de manada.",
    en: "A ferocious raptor, fast as the lightning it has yet to learn to summon, recognized you as its pack leader.",
  },
  boar: {
    es: "Un jabalí de fuego azul, tenaz e imparable, embistió hasta tu lado y allí se quedó; firme como la tierra, ardiente como su crin.",
    en: "A blue-fire boar, tenacious and unstoppable, charged to your side and stayed; firm as earth, blazing as its mane.",
  },
};

export const PASSIVE_INTROS: Record<string, Bi> = {
  golpe_certero: {
    es: "Tu alma renació con puntería sobrenatural: tus golpes encuentran el punto débil más seguido que los de cualquiera.",
    en: "Your soul was reborn with uncanny aim: your blows find the weak point more often than anyone's.",
  },
  coraza_espiritual: {
    es: "Un aura protectora envuelve tu espíritu; el dolor que el mundo te inflige llega siempre amortiguado.",
    en: "A protective aura wraps your spirit; the harm the world deals you always lands softened.",
  },
  reflejo_renacido: {
    es: "Tus reflejos volvieron afilados de la otra vida: esquivas lo que a otros los derriba.",
    en: "Your reflexes came back sharpened from the other life: you dodge what fells others.",
  },
  lazo_almas: {
    es: "Un vínculo profundo te une a tu compañero; juntos rinden más de lo que sumarían por separado.",
    en: "A deep bond ties you to your companion; together you achieve more than the sum of you apart.",
  },
  fortuna_renacido: {
    es: "La fortuna sonríe a quien volvió: cada victoria te deja más khryn en las manos.",
    en: "Fortune smiles on the returned: every victory leaves more khryn in your hands.",
  },
  codicia_destino: {
    es: "El destino es generoso contigo; los tesoros raros aparecen ante ti más a menudo.",
    en: "Fate is generous with you; rare treasures appear before you more often.",
  },
  forjador_innato: {
    es: "Naciste con manos de forjador; capturas y forjas almas con un éxito que otros envidian.",
    en: "You were born with a forger's hands; you capture and forge souls with a success others envy.",
  },
  memoria_vidas: {
    es: "Conservas la memoria de vidas pasadas; aprendes más rápido todo lo que ya fuiste.",
    en: "You keep the memory of past lives; you learn faster all that you once were.",
  },
  nucleo_elemental: {
    es: "Un núcleo elemental late en ti; tu magia de afinidad golpea más fuerte que la de los demás.",
    en: "An elemental core beats within you; your affinity magic strikes harder than anyone's.",
  },
  hambre_vital: {
    es: "Un hambre vital te acompaña; parte del daño que infliges vuelve a ti como vida.",
    en: "A vital hunger travels with you; part of the damage you deal returns to you as life.",
  },
  viajero_etereo: {
    es: "Caminas entre planos con soltura; cuando un combate no te conviene, te escabulles con facilidad.",
    en: "You walk between planes with ease; when a fight is not worth it, you slip away.",
  },
  flujo_mana: {
    es: "El maná fluye en ti sin esfuerzo; tus hechizos cuestan menos de lo que deberían.",
    en: "Mana flows in you effortlessly; your spells cost less than they should.",
  },
};

/** Pick the intro for an id, with locale fallback (locale → en → es → ""). */
export function revealIntro(map: Record<string, Bi>, id: string | null, locale: string): string {
  if (!id) return "";
  const bi = map[id];
  if (!bi) return "";
  if (locale === "es") return bi.es;
  return bi.en || bi.es;
}
