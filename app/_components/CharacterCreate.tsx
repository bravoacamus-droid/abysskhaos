"use client";

import { useEffect, useState } from "react";

import { ApiError, createCharacter, type CreatedCharacter } from "@/lib/client/api";
import { OCCUPATION_IDS, HOBBY_IDS } from "@/lib/client/destiny-options";
import { t, type Locale } from "@/lib/i18n";

const NAME_PATTERN = /^[\p{L}\p{N} _.\-']{1,24}$/u;
const MIN_AGE = 13;

type Step = "birth" | "occupation" | "hobby" | "name";
const STEPS: Step[] = ["birth", "occupation", "hobby", "name"];

type Props = {
  initData: string;
  locale: Locale;
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

export default function CharacterCreate({ initData, locale, onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>("birth");
  const [birthDate, setBirthDate] = useState("");
  const [occupationId, setOccupationId] = useState<string | null>(null);
  const [hobbyId, setHobbyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedCharacter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const age = ageFromBirth(birthDate);
  const birthValid = age !== null && age >= MIN_AGE && age < 120;
  const nameValid = NAME_PATTERN.test(name);
  const todayStr = new Date().toISOString().slice(0, 10);

  async function submit() {
    if (!birthValid || !occupationId || !hobbyId || !nameValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const character = await createCharacter({ initData, name, birthDate, occupationId, hobbyId, locale });
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
            <SecondaryButton disabled={submitting} onClick={() => setStep("hobby")}>
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

/**
 * The element orb: cycles its `element-flicker` atlas frames so the element
 * "lives" inside a still glass sphere. Falls back to the single static frame
 * when the atlas isn't populated. Preloads frames to avoid first-loop flicker.
 */
function OrbDisplay({
  atlas,
  fallback,
  alt,
}: {
  atlas: string[] | null;
  fallback: string | null;
  alt: string;
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
      width={112}
      height={112}
      className="mx-auto h-28 w-28 object-contain drop-shadow-[0_0_12px_rgba(120,120,255,0.35)]"
      style={{ imageRendering: "pixelated" }}
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
  return (
    <div className="space-y-5 text-center">
      <h1 className="bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-2xl font-bold uppercase tracking-widest text-transparent">
        {t(locale, "destiny.reveal_title")}
      </h1>
      <p className="text-3xl font-bold text-white">{character.name}</p>

      <OrbDisplay atlas={d.element_orb_atlas} fallback={d.element_orb_url} alt={d.element_name} />

      <div className="space-y-2 rounded-lg border border-abyss-soul/40 bg-abyss-deep p-5 text-left">
        <RevealRow label={t(locale, "destiny.reveal_class")} value={d.class_name} />
        <RevealRow label={t(locale, "destiny.reveal_element")} value={d.element_name} />
        <RevealRow label={t(locale, "destiny.reveal_companion")} value={d.companion_name} />
        <RevealRow
          label={t(locale, "destiny.reveal_passive")}
          value={`${d.passive_name} (${sign}${d.passive_value}%)`}
        />
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

      <button
        type="button"
        onClick={onEnter}
        className="w-full rounded-md bg-abyss-khaos py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-abyss-khaos/80"
      >
        {t(locale, "destiny.enter")}
      </button>
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
