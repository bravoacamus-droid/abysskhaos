/**
 * Lazy-instantiated S3 client targeted at Cloudflare R2.
 *
 * R2 is S3-API-compatible but uses a different endpoint and signing region
 * (`auto`). All env vars are server-only — never expose to the browser.
 */

import { S3Client } from "@aws-sdk/client-s3";

let cached: S3Client | null = null;

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getR2Client(): S3Client {
  if (cached) return cached;
  cached = new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT", process.env.R2_ENDPOINT),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY", process.env.R2_SECRET_ACCESS_KEY),
    },
  });
  return cached;
}

export function getR2Bucket(): string {
  return required("R2_BUCKET", process.env.R2_BUCKET);
}

export function getR2PublicBaseUrl(): string {
  // Strip trailing slash if present so we can `${base}/${key}` cleanly.
  return required("R2_PUBLIC_BASE_URL", process.env.R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
}
