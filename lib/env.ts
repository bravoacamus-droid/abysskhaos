/**
 * Centralised env-var access. Throws at boot if a required server-only var is
 * missing — better than silently failing on the first auth request.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Public (safe to expose to the browser).
export const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Server-only — must NEVER be referenced from client code. Lazy-resolved so
// `next build` doesn't fail when these are unset (e.g. in CI typecheck).
export const serverEnv = {
  get TELEGRAM_BOT_TOKEN() {
    return required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN);
  },
  get SUPABASE_URL() {
    return required("SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  /** Max age, in seconds, for which an `auth_date` from Telegram is accepted. */
  get TELEGRAM_INIT_DATA_MAX_AGE_SECONDS() {
    return Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 86_400);
  },
};
