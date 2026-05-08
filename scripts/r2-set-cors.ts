/**
 * Configure CORS on the R2 bucket so Phaser (XMLHttpRequest) can load
 * sprites + tilesets from cross-origin pages (Vercel + Telegram WebView).
 *
 * Without this, every PNG fetch fails with "No Access-Control-Allow-Origin
 * header is present on the requested resource".
 *
 * Idempotent — re-running overwrites the bucket's CORS config with the same
 * value. Run once after the bucket is provisioned, or any time the rules
 * need to change.
 *
 * Usage:  pnpm tsx scripts/r2-set-cors.ts
 */

import { config as loadEnv } from "dotenv";
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";

import { getR2Bucket, getR2Client } from "../lib/r2/client";

loadEnv({ path: ".env.local" });

async function main() {
  const bucket = getR2Bucket();
  const client = getR2Client();

  const result = await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            // Phaser uses XHR + Image() crossorigin; both need GET + HEAD.
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD"],
            // Public read assets — any origin is allowed to fetch.
            // Tighten if we ever serve private assets from this bucket.
            AllowedOrigins: ["*"],
            ExposeHeaders: ["Content-Length", "Content-Type", "ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log("PutBucketCors OK", { bucket, requestId: result.$metadata.requestId });
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
