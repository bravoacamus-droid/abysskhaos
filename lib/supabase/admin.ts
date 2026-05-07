import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — only call from trusted server code
 * (Edge Functions, Route Handlers running on the server).
 *
 * Lazy + memoised so that `next build` typecheck doesn't trigger env access.
 *
 * `cache: "no-store"` is forced on every internal `fetch` call. Without it,
 * Next.js's automatic fetch-caching layer can serve stale rows on Vercel
 * even when the route is `dynamic = "force-dynamic"`: dynamic opts the
 * route out of static rendering but NOT out of the fetch dedupe/cache.
 * Caught when the public `/api/v1/classes` returned v1 portrait URLs after
 * the regeneration to v2 (admin endpoint hit a different URL → fresh).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...(init ?? {}), cache: "no-store" }),
    },
  });
  return cached;
}
