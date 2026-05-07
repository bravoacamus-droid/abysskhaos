/**
 * Upload helper for assets going to Cloudflare R2.
 *
 * Per docs/ARCHITECTURE.md §5: assets are content-addressed. The R2 key
 * is `assets/<sha256>.<ext>`, immutably cached for a year. If the same
 * bytes are uploaded twice, the key collides — that's the point.
 */

import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { getR2Bucket, getR2Client, getR2PublicBaseUrl } from "./client";

export type UploadResult = {
  hash: string;
  key: string;
  url: string;
  bytes: number;
  alreadyExisted: boolean;
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Upload `data` to R2 under `assets/<sha256>.<ext>`. If the object already
 * exists with the same hash, skips the upload and returns the existing URL.
 *
 * The `Cache-Control` header is set to one year + `immutable` per the
 * content-hash invariant. Browsers and the Cloudflare CDN can cache forever.
 */
export async function uploadAsset(
  data: Buffer | Uint8Array,
  contentType = "image/png",
): Promise<UploadResult> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const hash = sha256Hex(buffer);
  const ext = EXT_BY_MIME[contentType] ?? "bin";
  const key = `assets/${hash}.${ext}`;
  const bucket = getR2Bucket();
  const client = getR2Client();

  // Check if it's already there. Saves a PUT and confirms the upstream is OK.
  let alreadyExisted = false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    alreadyExisted = true;
  } catch (err) {
    // 404 / NoSuchKey is the expected "needs upload" case.
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status !== 404 && status !== 403) {
      throw err;
    }
  }

  if (!alreadyExisted) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  const url = `${getR2PublicBaseUrl()}/${key}`;
  return { hash, key, url, bytes: buffer.byteLength, alreadyExisted };
}
