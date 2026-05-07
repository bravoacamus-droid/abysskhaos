/**
 * Delete an object from R2. Idempotent: deleting a non-existent key is a
 * no-op (R2 returns 204). Used by the orphan-asset cleanup script.
 */

import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { getR2Bucket, getR2Client } from "./client";

export async function deleteFromR2(key: string): Promise<void> {
  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }),
  );
}
