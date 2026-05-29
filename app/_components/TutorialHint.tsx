"use client";

import { t, type Locale } from "@/lib/i18n";
import type { TutorialStep } from "@/lib/client/api";

type Props = {
  step: TutorialStep;
  locale: Locale;
};

/** The blinking hint banner that floats above the canvas during the
 *  first-login tutorial. Hidden the moment tutorial_step transitions
 *  to 'complete'. The icon on the left previews the input the player
 *  should hit (↓ for movement, Z for pickup, etc.). */
export function TutorialHint({ step, locale }: Props) {
  if (step === "complete") return null;

  const text = t(locale, `tutorial.step.${step}`);
  const icon =
    step === "walk_to_cedric"
      ? "↓"
      : step === "pickup_sword" || step === "after_dialogue"
        ? "Z"
        : step === "equip_sword"
          ? "I"
          : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-40 flex justify-center">
      <div className="flex items-center gap-3 rounded-md border-2 border-abyss-soul/80 bg-abyss-deep/95 px-4 py-2.5 shadow-2xl backdrop-blur">
        {icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded border border-abyss-soul/60 bg-abyss-void text-xl font-bold text-abyss-soul shadow-inner">
            {icon}
          </span>
        ) : null}
        <span className="text-sm font-semibold text-white">{text}</span>
      </div>
    </div>
  );
}
