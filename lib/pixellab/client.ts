/**
 * Minimal HTTP client for PixelLab.ai.
 *
 * The MCP server is for *interactive* dev-time sprite generation; this
 * module is for batch/automation scripts (build-time pipeline, future
 * NFT runtime). Same Bearer token. Same docs at api.pixellab.ai/v2/docs.
 */

const PIXELLAB_BASE_URL = "https://api.pixellab.ai/v1";

export type PixfluxRequest = {
  description: string;
  image_size: { width: number; height: number };
  negative_description?: string;
  text_guidance_scale?: number;
  no_background?: boolean;
  outline?:
    | "single color black outline"
    | "single color outline"
    | "selective outline"
    | "lineless";
  shading?: "flat shading" | "basic shading" | "medium shading" | "detailed shading";
  detail?: "low detail" | "medium detail" | "highly detailed";
  view?: "side" | "low top-down" | "high top-down";
  direction?: "south" | "north" | "east" | "west";
  isometric?: boolean;
  oblique_projection?: boolean;
  coverage_percentage?: number;
};

export type PixfluxUsage = {
  type: string;
  usd: number;
};

export type PixfluxResponse = {
  image: { type: "base64"; base64: string };
  usage: PixfluxUsage;
};

class PixelLabError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "PixelLabError";
  }
}

function getApiKey(): string {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error("Missing env var: PIXELLAB_API_KEY");
  return key;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${PIXELLAB_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // leave as text
  }
  if (!res.ok) {
    throw new PixelLabError(`PixelLab ${path} → ${res.status}`, res.status, body);
  }
  return body as T;
}

/**
 * `pixflux` — flagship text-to-pixel-art endpoint. Synchronous; returns the
 * base64 PNG directly. Suitable for portraits, icons, and any single-frame
 * static image up to 400×400.
 */
export async function pixflux(req: PixfluxRequest): Promise<PixfluxResponse> {
  return request<PixfluxResponse>("/generate-image-pixflux", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** Convert the PixelLab `image.base64` field to a Buffer for upload. */
export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export { PixelLabError };
