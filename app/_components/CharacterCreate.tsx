"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, createCharacter, type ClassRow, type CreatedCharacter } from "@/lib/client/api";
import { OCCUPATION_IDS, HOBBY_IDS } from "@/lib/client/destiny-options";
import {
  ELEMENT_INTROS,
  COMPANION_INTROS,
  PASSIVE_INTROS,
  revealIntro,
} from "@/data/destiny/reveal-intros";
import { t, type Locale } from "@/lib/i18n";

const NAME_PATTERN = /^[\p{L}\p{N} _.\-']{1,24}$/u;
const MIN_AGE = 13;

type Step = "birth" | "occupation" | "hobby" | "class" | "name";
const STEPS: Step[] = ["birth", "occupation", "hobby", "class", "name"];

type Props = {
  initData: string;
  locale: Locale;
  classes: ClassRow[];
  onCreated: (character: CreatedCharacter) => void;
  onCancel?: () => void;
};

/** Whole years between an ISO date and today; null if the string is malformed. */
function ageFromBirth(birthDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
  return age;
}

export default function CharacterCreate({ initData, locale, classes, onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>("birth");
  const [birthDate, setBirthDate] = useState("");
  const [occupationId, setOccupationId] = useState<string | null>(null);
  const [hobbyId, setHobbyId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [weaponLoadoutId, setWeaponLoadoutId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedCharacter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const age = ageFromBirth(birthDate);
  const birthValid = age !== null && age >= MIN_AGE && age < 120;
  const nameValid = NAME_PATTERN.test(name);
  const classValid = !!classId && !!weaponLoadoutId;
  const todayStr = new Date().toISOString().slice(0, 10);

  async function submit() {
    if (!birthValid || !occupationId || !hobbyId || !classValid || !nameValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const character = await createCharacter({
        initData,
        name,
        birthDate,
        occupationId,
        hobbyId,
        classId: classId!,
        weaponLoadoutId: weaponLoadoutId!,
        locale,
      });
      setCreated(character);
    } catch (err) {
      setError(humanizeError(err, locale));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return <Reveal locale={locale} character={created} onEnter={() => onCreated(created)} />;
  }

  return (
    <div className="space-y-6">
      <header className="relative text-center">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="absolute left-0 top-0 rounded-md border border-abyss-coal/60 px-2 py-1 text-[10px] uppercase tracking-widest text-abyss-fog hover:border-abyss-fog/60 hover:text-abyss-mist"
          >
            ✕
          </button>
        ) : null}
        <h1 className="bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-3xl font-bold uppercase tracking-widest text-transparent">
          {t(locale, "destiny.title")}
        </h1>
        <Stepper step={step} />
      </header>

      {error ? <p className="text-center text-xs text-abyss-ember">{error}</p> : null}

      {step === "birth" ? (
        <section className="space-y-4">
          <StepHead locale={locale} title="destiny.step_birth" hint="destiny.step_birth_hint" />
          <input
            type="date"
            value={birthDate}
            max={todayStr}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-md border border-abyss-coal/80 bg-abyss-deep px-4 py-3 text-center text-lg text-white outline-none focus:border-abyss-soul"
          />
          {birthDate.length > 0 && !birthValid ? (
            <p className="text-center text-xs text-abyss-ember">{t(locale, "destiny.birth_invalid")}</p>
          ) : null}
          <PrimaryButton disabled={!birthValid} onClick={() => setStep("occupation")}>
            {t(locale, "wizard.next")}
          </PrimaryButton>
        </section>
      ) : null}

      {step === "occupation" ? (
        <OptionGrid
          locale={locale}
          title="destiny.step_occupation"
          hint="destiny.step_occupation_hint"
          prefix="destiny.occupation"
          ids={OCCUPATION_IDS}
          selected={occupationId}
          onSelect={setOccupationId}
          onBack={() => setStep("birth")}
          onContinue={() => setStep("hobby")}
        />
      ) : null}

      {step === "hobby" ? (
        <OptionGrid
          locale={locale}
          title="destiny.step_hobby"
          hint="destiny.step_hobby_hint"
          prefix="destiny.hobby"
          ids={HOBBY_IDS}
          selected={hobbyId}
          onSelect={setHobbyId}
          onBack={() => setStep("occupation")}
          onContinue={() => setStep("class")}
        />
      ) : null}

      {step === "class" ? (
        <ClassPicker
          locale={locale}
          classes={classes}
          classId={classId}
          weaponLoadoutId={weaponLoadoutId}
          onPick={(cid, wid) => {
            setClassId(cid);
            setWeaponLoadoutId(wid);
          }}
          onBack={() => setStep("hobby")}
          onContinue={() => setStep("name")}
        />
      ) : null}

      {step === "name" ? (
        <section className="space-y-4">
          <StepHead locale={locale} title="wizard.step_name" hint="destiny.step_name_hint" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(locale, "wizard.name_placeholder")}
            maxLength={24}
            autoFocus
            className="w-full rounded-md border border-abyss-coal/80 bg-abyss-deep px-4 py-3 text-center text-lg text-white outline-none focus:border-abyss-soul"
          />
          {name.length > 0 && !nameValid ? (
            <p className="text-center text-xs text-abyss-ember">{t(locale, "wizard.name_invalid")}</p>
          ) : null}
          <div className="flex gap-3">
            <SecondaryButton disabled={submitting} onClick={() => setStep("class")}>
              {t(locale, "wizard.back")}
            </SecondaryButton>
            <button
              type="button"
              onClick={submit}
              disabled={!nameValid || submitting}
              className="flex-1 rounded-md bg-abyss-khaos py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-abyss-khaos/80 disabled:cursor-not-allowed disabled:bg-abyss-coal disabled:text-abyss-fog"
            >
              {submitting ? t(locale, "wizard.creating") : t(locale, "destiny.roll")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="mt-3 flex justify-center gap-1.5">
      {STEPS.map((s) => (
        <span
          key={s}
          className={`h-1 w-8 rounded-full transition ${
            step === s ? "bg-abyss-soul" : STEPS.indexOf(step) > STEPS.indexOf(s) ? "bg-abyss-khaos" : "bg-abyss-coal"
          }`}
        />
      ))}
    </div>
  );
}

function StepHead({ locale, title, hint }: { locale: Locale; title: string; hint: string }) {
  return (
    <>
      <p className="text-center text-sm uppercase tracking-widest text-abyss-mist">{t(locale, title)}</p>
      <p className="text-center text-xs text-abyss-fog">{t(locale, hint)}</p>
    </>
  );
}

function OptionGrid({
  locale,
  title,
  hint,
  prefix,
  ids,
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  locale: Locale;
  title: string;
  hint: string;
  prefix: string;
  ids: readonly string[];
  selected: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="space-y-4">
      <StepHead locale={locale} title={title} hint={hint} />
      <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
        {ids.map((id) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                isSelected
                  ? "border-abyss-soul/80 bg-abyss-ink text-white shadow-lg shadow-abyss-soul/10"
                  : "border-abyss-coal/80 bg-abyss-deep text-abyss-mist hover:border-abyss-khaos/60"
              }`}
            >
              {t(locale, `${prefix}.${id}`)}
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t(locale, "wizard.back")}</SecondaryButton>
        <PrimaryButton disabled={!selected} onClick={onContinue}>
          {t(locale, "wizard.next")}
        </PrimaryButton>
      </div>
    </section>
  );
}

/** URLs already requested this session — so switching class/weapon never
 *  re-downloads or re-decodes the same frame (the leak that crashed the
 *  WebView: `new Image()` for every frame on every switch). */
const PRELOADED = new Set<string>();

/** Cycles a list of frame URLs as a looping animation. Preloads each URL
 *  exactly once (deduped globally) to avoid first-loop flicker without
 *  re-fetching on every class/weapon switch. */
function AnimatedSprite({ frames, alt, fps = 10 }: { frames: string[]; alt: string; fps?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    for (const src of frames) {
      if (PRELOADED.has(src)) continue;
      PRELOADED.add(src);
      const img = new Image();
      img.src = src;
    }
    if (frames.length <= 1) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), Math.round(1000 / fps));
    return () => clearInterval(id);
  }, [frames, fps]);
  if (frames.length === 0) {
    return <div className="flex h-40 items-center justify-center text-xs text-abyss-fog">—</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frames[Math.min(frame, frames.length - 1)] ?? frames[0]}
      alt={alt}
      className="mx-auto h-40 w-40 object-contain drop-shadow-[0_0_14px_rgba(120,120,255,0.3)]"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

/**
 * Class + initial-weapon picker. Shows the chosen class as its ANIMATED attack
 * sprite, with a weapon toggle so the player previews every starting weapon's
 * style before committing (2026-06-16: class is chosen, not rolled).
 */
function ClassPicker({
  locale,
  classes,
  classId,
  weaponLoadoutId,
  onPick,
  onBack,
  onContinue,
}: {
  locale: Locale;
  classes: ClassRow[];
  classId: string | null;
  weaponLoadoutId: string | null;
  onPick: (classId: string, weaponLoadoutId: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  // Default-select the first class + its first weapon so a preview is always
  // shown and Continue can be enabled once the player confirms.
  useEffect(() => {
    if (!classId && classes.length > 0) {
      const first = classes[0]!;
      const w = first.weapon_pool[0];
      if (w) onPick(first.id, w);
    }
  }, [classId, classes, onPick]);

  const active = classes.find((c) => c.id === classId) ?? classes[0] ?? null;
  const activeWeapon = weaponLoadoutId ?? active?.weapon_pool[0] ?? null;
  const frames = active && activeWeapon ? active.combat_preview[activeWeapon] ?? [] : [];

  return (
    <section className="space-y-4">
      <StepHead locale={locale} title="destiny.step_class" hint="destiny.step_class_hint" />

      {/* Class chips */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {classes.map((c) => {
          const isSel = c.id === active?.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id, c.weapon_pool[0] ?? "")}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition ${
                isSel
                  ? "border-abyss-soul/80 bg-abyss-ink text-white"
                  : "border-abyss-coal/80 bg-abyss-deep text-abyss-mist hover:border-abyss-khaos/60"
              }`}
            >
              {c.name_localized}
            </button>
          );
        })}
      </div>

      {/* Animated attack preview */}
      <div className="rounded-lg border border-abyss-soul/30 bg-abyss-deep p-3">
        <AnimatedSprite frames={frames} alt={active?.name_localized ?? ""} />
        {active ? (
          <p className="mt-1 text-center text-xs text-abyss-fog">{active.description_localized}</p>
        ) : null}
      </div>

      {/* Weapon toggle */}
      {active ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          {active.weapon_pool.map((w) => {
            const isSel = w === activeWeapon;
            return (
              <button
                key={w}
                type="button"
                onClick={() => onPick(active.id, w)}
                className={`rounded-md border px-3 py-1.5 text-xs transition ${
                  isSel
                    ? "border-abyss-khaos bg-abyss-khaos/20 text-white"
                    : "border-abyss-coal/80 bg-abyss-deep text-abyss-mist hover:border-abyss-khaos/60"
                }`}
              >
                {t(locale, `destiny.weapon.${w}`)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t(locale, "wizard.back")}</SecondaryButton>
        <PrimaryButton disabled={!classId || !weaponLoadoutId} onClick={onContinue}>
          {t(locale, "wizard.next")}
        </PrimaryButton>
      </div>
    </section>
  );
}

/**
 * The element orb: cycles its `element-flicker` atlas frames so the element
 * "lives" inside a still glass sphere. Falls back to the single static frame
 * when the atlas isn't populated. Preloads frames to avoid first-loop flicker.
 */
function OrbDisplay({
  atlas,
  fallback,
  alt,
  size = 112,
}: {
  atlas: string[] | null;
  fallback: string | null;
  alt: string;
  size?: number;
}) {
  const frames = atlas && atlas.length > 0 ? atlas : fallback ? [fallback] : [];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;
    frames.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 110);
    return () => clearInterval(id);
  }, [frames.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (frames.length === 0) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frames[frame] ?? frames[0]}
      alt={alt}
      width={size}
      height={size}
      className="mx-auto object-contain drop-shadow-[0_0_16px_rgba(120,120,255,0.4)]"
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
}

/**
 * Plays a pet's reveal clips (greeting → skill → idea) as one looping sequence.
 * Pets are single-facing (south-west); frames are preloaded to avoid flicker.
 */
function PetPlayer({
  clips,
  alt,
  size = 144,
}: {
  clips: { greeting: string[]; skill: string[]; idea: string[] } | null;
  alt: string;
  size?: number;
}) {
  const frames = useMemo(
    () => (clips ? [...clips.greeting, ...clips.skill, ...clips.idea] : []),
    [clips],
  );
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    if (frames.length <= 1) return;
    frames.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 110);
    return () => clearInterval(id);
  }, [frames.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (frames.length === 0) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frames[frame] ?? frames[0]}
      alt={alt}
      width={size}
      height={size}
      className="mx-auto object-contain drop-shadow-[0_0_14px_rgba(120,120,255,0.35)]"
      style={{ imageRendering: "pixelated", width: size, height: size }}
    />
  );
}

function Reveal({
  locale,
  character,
  onEnter,
}: {
  locale: Locale;
  character: CreatedCharacter;
  onEnter: () => void;
}) {
  const d = character.destiny;
  const sign = d.passive_sign === "-" ? "−" : "+";
  const [step, setStep] = useState(0);

  // 3 spotlight steps — each with the destiny's spotlight given its protagonism:
  // the living element orb, the animated companion, then the unique Don.
  const spotlights: { kicker: string; title: string; badge?: string; intro: string; visual: React.ReactNode }[] = [
    {
      kicker: t(locale, "destiny.reveal_element"),
      title: d.element_name,
      intro: revealIntro(ELEMENT_INTROS, character.element_id, locale),
      visual: <OrbDisplay atlas={d.element_orb_atlas} fallback={d.element_orb_url} alt={d.element_name} size={160} />,
    },
    {
      kicker: t(locale, "destiny.reveal_companion"),
      title: d.companion_name,
      intro: revealIntro(COMPANION_INTROS, character.companion_id, locale),
      visual: <PetPlayer clips={d.companion_clips} alt={d.companion_name} size={160} />,
    },
    {
      kicker: t(locale, "destiny.reveal_passive"),
      title: d.passive_name,
      badge: `${sign}${d.passive_value}%`,
      intro: revealIntro(PASSIVE_INTROS, character.passive_id, locale),
      visual: <PassiveSigil iconUrl={d.passive_icon_url} accent={d.element_color} alt={d.passive_name} />,
    },
  ];
  const cur = spotlights[step]!;
  const isLast = step === spotlights.length - 1;

  return (
    <div className="space-y-6 text-center">
      <h1 className="bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-2xl font-bold uppercase tracking-widest text-transparent">
        {t(locale, "destiny.reveal_title")}
      </h1>
      <p className="text-2xl font-bold text-white">{character.name}</p>

      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.3em] text-abyss-fog">{cur.kicker}</p>
        <div className="flex min-h-[172px] items-center justify-center">{cur.visual}</div>
        <p className="text-2xl font-bold text-white">
          {cur.title}
          {cur.badge ? <span className="ml-2 align-middle text-base font-semibold text-abyss-soul">{cur.badge}</span> : null}
        </p>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-abyss-mist">{cur.intro}</p>
      </div>

      <RevealDots step={step} total={spotlights.length} />

      {isLast ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-abyss-soul/40 bg-abyss-deep p-4 text-left">
            <RevealRow label={t(locale, "destiny.reveal_class")} value={d.class_name} />
            <RevealRow label={t(locale, "destiny.reveal_weapon")} value={t(locale, `destiny.weapon.${d.weapon_loadout_id}`)} />
          </div>
          <dl className="grid grid-cols-4 gap-2 text-xs">
            <Stat label="STR" value={character.attr_strength} />
            <Stat label="AGI" value={character.attr_agility} />
            <Stat label="INT" value={character.attr_intelligence} />
            <Stat label="SPI" value={character.attr_spirit} />
            <Stat label={t(locale, "hub.stats.hp")} value={character.hp_max} />
            <Stat label={t(locale, "hub.stats.mp")} value={character.mp_max} />
            <Stat label={t(locale, "hub.stats.atk")} value={character.atk} />
            <Stat label={t(locale, "hub.stats.def")} value={character.def} />
          </dl>
        </div>
      ) : null}

      <div className="flex gap-3">
        {step > 0 ? (
          <SecondaryButton onClick={() => setStep((s) => s - 1)}>{t(locale, "wizard.back")}</SecondaryButton>
        ) : null}
        {isLast ? (
          <button
            type="button"
            onClick={onEnter}
            className="flex-1 rounded-md bg-abyss-khaos py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-abyss-khaos/80"
          >
            {t(locale, "destiny.enter")}
          </button>
        ) : (
          <PrimaryButton onClick={() => setStep((s) => s + 1)}>{t(locale, "wizard.next")}</PrimaryButton>
        )}
      </div>
    </div>
  );
}

function RevealDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-abyss-soul" : "w-1.5 bg-abyss-coal"}`}
        />
      ))}
    </div>
  );
}

/** The Don's sigil. Uses the passive icon once it exists (Phase 3); until then,
 *  a glowing rune tinted by the element color so the step still has presence. */
function PassiveSigil({ iconUrl, accent, alt }: { iconUrl: string | null; accent: string | null; alt: string }) {
  const color = accent ?? "#7c7cff";
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt={alt}
        width={128}
        height={128}
        className="mx-auto object-contain drop-shadow-[0_0_16px_rgba(120,120,255,0.4)]"
        style={{ imageRendering: "pixelated", width: 128, height: 128 }}
      />
    );
  }
  return (
    <div
      className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-2 bg-abyss-deep/60"
      style={{ borderColor: color, boxShadow: `0 0 26px ${color}55` }}
    >
      <span className="text-5xl" style={{ color }}>✦</span>
    </div>
  );
}

function RevealRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-abyss-coal/40 pb-1.5 last:border-0">
      <dt className="text-xs uppercase tracking-widest text-abyss-fog">{label}</dt>
      <dd className="text-right font-semibold text-white">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded bg-abyss-void/60 px-2 py-1.5">
      <span className="text-[10px] uppercase text-abyss-fog">{label}</span>
      <span className="font-mono font-semibold text-white">{value}</span>
    </div>
  );
}

function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex-1 rounded-md bg-abyss-soul py-3 text-sm font-semibold uppercase tracking-widest text-abyss-void transition hover:bg-abyss-soul/90 disabled:cursor-not-allowed disabled:bg-abyss-coal disabled:text-abyss-fog"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex-1 rounded-md border border-abyss-coal/80 py-3 text-sm uppercase tracking-widest text-abyss-mist transition hover:border-abyss-fog/60 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function humanizeError(err: unknown, locale: Locale): string {
  if (err instanceof ApiError) {
    const localized = t(locale, `errors.${err.code}`);
    if (localized !== `errors.${err.code}`) return localized;
    return err.detail ?? err.code;
  }
  return err instanceof Error ? err.message : t(locale, "errors.generic");
}
