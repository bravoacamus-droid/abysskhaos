/**
 * Register an asset: upload to R2 + insert into `asset_generations`.
 *
 * Used by build-time scripts (Phase 2 portraits, Phase 3 mob sprites, etc.).
 * Idempotent on the content hash — re-running with the same bytes is a no-op
 * and returns the existing row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { uploadAsset } from "@/lib/r2/upload";

export type RegisterAssetInput = {
  /** Image bytes (PNG / JPEG / WEBP) to upload. */
  data: Buffer | Uint8Array;
  contentType?: string;
  /** Slug/ID of the entity this art belongs to (e.g. 'warrior', 'goblin'). */
  entityType: string;
  entityId: string;
  /** Which slot of that entity this fills: 'portrait' (default), 'sprite', 'icon', etc. */
  field?: string;
  /** Prompt sent to PixelLab. Logged for reproducibility. */
  prompt: string;
  /** PixelLab endpoint used: 'pixflux' / 'bitforge' / etc. */
  endpoint: string;
  /** Generation size in px, e.g. '96x96'. */
  generationSize: string;
  seed?: number | null;
  /** USD cost from PixelLab response.usage.usd. */
  costUsd?: number | null;
  /** How the call was made. */
  generatedVia: "mcp" | "http_api" | "manual";
  metadata?: Record<string, unknown>;
};

export type RegisterAssetResult = {
  id: string;
  hash: string;
  url: string;
  bytes: number;
  alreadyExisted: boolean;
};

export async function registerAsset(
  supabase: SupabaseClient,
  input: RegisterAssetInput,
): Promise<RegisterAssetResult> {
  const upload = await uploadAsset(input.data, input.contentType ?? "image/png");

  // Upsert by output_hash so re-runs are idempotent. The unique constraint
  // on `output_hash` lets us return the existing row when the bytes are
  // unchanged.
  const { data, error } = await supabase
    .from("asset_generations")
    .upsert(
      {
        entity_type: input.entityType,
        entity_id: input.entityId,
        field: input.field ?? "portrait",
        prompt: input.prompt,
        endpoint: input.endpoint,
        generation_size: input.generationSize,
        seed: input.seed ?? null,
        output_hash: upload.hash,
        output_r2_key: upload.key,
        output_r2_url: upload.url,
        output_bytes: upload.bytes,
        cost_usd: input.costUsd ?? null,
        generated_via: input.generatedVia,
        metadata: input.metadata ?? {},
      },
      { onConflict: "output_hash" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`registerAsset DB insert failed: ${error.message}`);

  return {
    id: data.id as string,
    hash: upload.hash,
    url: upload.url,
    bytes: upload.bytes,
    alreadyExisted: upload.alreadyExisted,
  };
}
