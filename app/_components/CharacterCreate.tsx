"use client";

import { useEffect, useState } from "react";

import { ApiError, createCharacter, fetchClasses, type CharacterRow, type ClassRow } from "@/lib/client/api";
import { t, type Locale } from "@/lib/i18n";

const NAME_PATTERN = /^[\p{L}\p{N} _.\-']{1,24}$/u;

type Step = "class" | "name" | "confirm";

type Props = {
  initData: string;
  locale: Locale;
  onCreated: (character: CharacterRow) => void;
  onCancel?: () => void;
};

export default function CharacterCreate({ initData, locale, onCreated, onCancel }: Props) {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("class");
  const [selectedClass, setSelectedClass] = useState<ClassRow | null>(null);
  const [name, setName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetchClasses({ initData, locale, signal: ac.signal })
      .then((data) => setClasses(data))
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setError(humanizeError(err, locale));
      });
    return () => ac.abort();
  }, [initData, locale]);

  if (error) return <ErrorPanel message={error} />;
  if (!classes) return <LoadingPanel locale={locale} />;

  const valid = NAME_PATTERN.test(name);

  async function submit() {
    if (!selectedClass || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const character = await createCharacter({
        initData,
        name,
        classId: selectedClass.id,
      });
      onCreated(character);
    } catch (err) {
      setError(humanizeError(err, locale));
    } finally {
      setSubmitting(false);
    }
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
          {t(locale, "wizard.title")}
        </h1>
        <Stepper step={step} />
      </header>

      {step === "class" ? (
        <ClassPicker
          classes={classes}
          selected={selectedClass}
          onSelect={setSelectedClass}
          locale={locale}
          onContinue={() => setStep("name")}
        />
      ) : null}

      {step === "name" ? (
        <NameStep
          name={name}
          setName={setName}
          locale={locale}
          onBack={() => setStep("class")}
          onContinue={() => setStep("confirm")}
          valid={valid}
        />
      ) : null}

      {step === "confirm" && selectedClass ? (
        <ConfirmStep
          locale={locale}
          name={name}
          klass={selectedClass}
          submitting={submitting}
          onBack={() => setStep("name")}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Step[] = ["class", "name", "confirm"];
  return (
    <div className="mt-3 flex justify-center gap-1.5">
      {steps.map((s) => (
        <span
          key={s}
          className={`h-1 w-10 rounded-full transition ${
            step === s ? "bg-abyss-soul" : steps.indexOf(step) > steps.indexOf(s) ? "bg-abyss-khaos" : "bg-abyss-coal"
          }`}
        />
      ))}
    </div>
  );
}

function ClassPicker({
  classes,
  selected,
  onSelect,
  locale,
  onContinue,
}: {
  classes: ClassRow[];
  selected: ClassRow | null;
  onSelect: (c: ClassRow) => void;
  locale: Locale;
  onContinue: () => void;
}) {
  return (
    <section className="space-y-4">
      <p className="text-center text-sm uppercase tracking-widest text-abyss-mist">
        {t(locale, "wizard.step_class")}
      </p>
      <p className="text-center text-xs text-abyss-fog">{t(locale, "wizard.step_class_hint")}</p>
      <div className="grid grid-cols-1 gap-3">
        {classes.map((c) => {
          const isSelected = selected?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className={`flex items-center gap-4 rounded-lg border p-3 text-left transition ${
                isSelected
                  ? "border-abyss-soul/80 bg-abyss-ink shadow-lg shadow-abyss-soul/10"
                  : "border-abyss-coal/80 bg-abyss-deep hover:border-abyss-khaos/60"
              }`}
            >
              {c.portrait_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.portrait_url}
                  alt={c.name_localized}
                  width={64}
                  height={64}
                  className="h-16 w-16 shrink-0 rounded bg-abyss-void object-contain pixelated"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded bg-abyss-coal" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-white">{c.name_localized}</p>
                <p className="mt-1 text-xs leading-relaxed text-abyss-fog">{c.description_localized}</p>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={onContinue}
        className="w-full rounded-md bg-abyss-soul py-3 text-sm font-semibold uppercase tracking-widest text-abyss-void transition hover:bg-abyss-soul/90 disabled:cursor-not-allowed disabled:bg-abyss-coal disabled:text-abyss-fog"
      >
        {t(locale, "wizard.next")}
      </button>
    </section>
  );
}

function NameStep({
  name,
  setName,
  locale,
  onBack,
  onContinue,
  valid,
}: {
  name: string;
  setName: (v: string) => void;
  locale: Locale;
  onBack: () => void;
  onContinue: () => void;
  valid: boolean;
}) {
  return (
    <section className="space-y-4">
      <p className="text-center text-sm uppercase tracking-widest text-abyss-mist">
        {t(locale, "wizard.step_name")}
      </p>
      <p className="text-center text-xs text-abyss-fog">{t(locale, "wizard.step_name_hint")}</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(locale, "wizard.name_placeholder")}
        maxLength={24}
        autoFocus
        className="w-full rounded-md border border-abyss-coal/80 bg-abyss-deep px-4 py-3 text-center text-lg text-white outline-none focus:border-abyss-soul"
      />
      {name.length > 0 && !valid ? (
        <p className="text-center text-xs text-abyss-ember">{t(locale, "wizard.name_invalid")}</p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-md border border-abyss-coal/80 py-3 text-sm uppercase tracking-widest text-abyss-mist hover:border-abyss-fog/60"
        >
          {t(locale, "wizard.back")}
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!valid}
          className="flex-1 rounded-md bg-abyss-soul py-3 text-sm font-semibold uppercase tracking-widest text-abyss-void transition hover:bg-abyss-soul/90 disabled:cursor-not-allowed disabled:bg-abyss-coal disabled:text-abyss-fog"
        >
          {t(locale, "wizard.next")}
        </button>
      </div>
    </section>
  );
}

function ConfirmStep({
  locale,
  name,
  klass,
  submitting,
  onBack,
  onSubmit,
}: {
  locale: Locale;
  name: string;
  klass: ClassRow;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="space-y-4">
      <p className="text-center text-sm uppercase tracking-widest text-abyss-mist">
        {t(locale, "wizard.step_confirm")}
      </p>
      <p className="text-center text-xs text-abyss-fog">{t(locale, "wizard.step_confirm_hint")}</p>
      <div className="rounded-lg border border-abyss-soul/40 bg-abyss-deep p-5">
        <div className="flex items-center gap-4">
          {klass.portrait_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={klass.portrait_url}
              alt={klass.name_localized}
              width={80}
              height={80}
              className="h-20 w-20 rounded bg-abyss-void object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : null}
          <div>
            <p className="text-2xl font-bold text-white">{name}</p>
            <p className="text-sm text-abyss-mist">{klass.name_localized}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Stat label={t(locale, "hub.stats.hp")} value={String(klass.starting_hp)} />
          <Stat label={t(locale, "hub.stats.mp")} value={String(klass.starting_mp)} />
          <Stat label={t(locale, "hub.stats.atk")} value={String(klass.starting_atk)} />
          <Stat label={t(locale, "hub.stats.def")} value={String(klass.starting_def)} />
        </dl>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 rounded-md border border-abyss-coal/80 py-3 text-sm uppercase tracking-widest text-abyss-mist hover:border-abyss-fog/60 disabled:opacity-50"
        >
          {t(locale, "wizard.back")}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 rounded-md bg-abyss-khaos py-3 text-sm font-semibold uppercase tracking-widest text-white transition hover:bg-abyss-khaos/80 disabled:cursor-wait"
        >
          {submitting ? t(locale, "wizard.creating") : t(locale, "wizard.create")}
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between rounded bg-abyss-void/60 px-3 py-1.5">
      <dt className="text-abyss-fog">{label}</dt>
      <dd className="font-mono font-semibold text-white">{value}</dd>
    </div>
  );
}

function LoadingPanel({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-lg border border-abyss-coal/80 bg-abyss-deep p-6 text-center text-abyss-mist">
      <p className="text-sm uppercase tracking-widest">{t(locale, "landing.loading")}</p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-abyss-ember/40 bg-abyss-deep p-6 text-center">
      <p className="text-sm text-abyss-mist">{message}</p>
    </div>
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
