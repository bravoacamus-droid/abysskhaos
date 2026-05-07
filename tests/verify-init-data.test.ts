// Crypto roundtrip test for `lib/telegram/verify-init-data.ts`.
//
// Generates a fake initData signed with a fake bot token, then runs it
// through our actual verifier. Catches:
//   - HMAC algorithm regressions (key/message order, encoding)
//   - Field-exclusion regressions (e.g. dropping `signature`)
//   - URL-decoding regressions
//
// Run with:  pnpm test     (or:  node --test tests/)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// We import via a relative path; tests run from the repo root.
import { verifyInitData, InitDataError } from "../lib/telegram/verify-init-data";

const BOT_TOKEN = "1234567890:FAKE_TOKEN_FOR_TESTING_PURPOSES";

function buildSignedInitData({ token = BOT_TOKEN, omit = [], extra = {} } = {}) {
  const fakeUser = {
    id: 8435528312,
    first_name: "Sir.Monkey",
    last_name: "",
    language_code: "es",
    is_premium: false,
    allows_write_to_pm: true,
  };
  const fields = {
    user: JSON.stringify(fakeUser),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAH-fake-query-id",
    chat_instance: "-987654321",
    chat_type: "private",
    signature: "ed25519-third-party-signature-placeholder",
    ...extra,
  };
  for (const k of omit) delete fields[k];

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);

  const lines = [];
  for (const k of [...params.keys()].sort()) lines.push(`${k}=${params.get(k)}`);
  const dcs = lines.join("\n");

  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("accepts a freshly signed initData", async () => {
  const initData = buildSignedInitData();
  const result = await verifyInitData(initData, BOT_TOKEN, 86_400);
  assert.equal(result.user.first_name, "Sir.Monkey");
  assert.equal(result.user.id, 8435528312);
});

test("rejects when hash is missing", async () => {
  const params = new URLSearchParams(buildSignedInitData());
  params.delete("hash");
  await assert.rejects(
    () => verifyInitData(params.toString(), BOT_TOKEN, 86_400),
    (e) => e instanceof InitDataError && e.code === "MISSING_HASH",
  );
});

test("rejects when bot token is wrong", async () => {
  const initData = buildSignedInitData();
  await assert.rejects(
    () => verifyInitData(initData, "0000000000:WRONG", 86_400),
    (e) => e instanceof InitDataError && e.code === "BAD_HMAC",
  );
});

test("rejects when bot token has trailing whitespace before trim", async () => {
  // The verifier trims internally, so a token signed with whitespace SHOULD
  // still validate when verified with the trimmed token.
  const initData = buildSignedInitData({ token: BOT_TOKEN });
  const result = await verifyInitData(initData, "  " + BOT_TOKEN + "\n", 86_400);
  assert.equal(result.user.id, 8435528312);
});

test("rejects when initData is too old", async () => {
  const params = new URLSearchParams(buildSignedInitData());
  params.set("auth_date", String(Math.floor(Date.now() / 1000) - 100_000));
  // Need to re-sign after mutating auth_date.
  params.delete("hash");
  const lines = [];
  for (const k of [...params.keys()].sort()) lines.push(`${k}=${params.get(k)}`);
  const dcs = lines.join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  params.set("hash", hash);

  await assert.rejects(
    () => verifyInitData(params.toString(), BOT_TOKEN, 86_400),
    (e) => e instanceof InitDataError && e.code === "EXPIRED",
  );
});

test("preserves signature field in data-check-string", async () => {
  // Regression test for the BAD_HMAC bug: the `signature` field MUST stay in
  // the data-check-string for bot-token HMAC validation.
  const initData = buildSignedInitData({
    extra: { signature: "ed25519-x-signature-here" },
  });
  // Should validate fine because `buildSignedInitData` already includes
  // `signature` in the signed payload — if the verifier removed it, the
  // recomputed hash would differ.
  const result = await verifyInitData(initData, BOT_TOKEN, 86_400);
  assert.equal(result.raw.signature, "ed25519-x-signature-here");
});

test("rejects malformed user JSON", async () => {
  const params = new URLSearchParams(buildSignedInitData());
  params.set("user", "{not json");
  // Re-sign.
  params.delete("hash");
  const lines = [];
  for (const k of [...params.keys()].sort()) lines.push(`${k}=${params.get(k)}`);
  const dcs = lines.join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  params.set("hash", hash);

  await assert.rejects(
    () => verifyInitData(params.toString(), BOT_TOKEN, 86_400),
    (e) => e instanceof InitDataError && e.code === "MALFORMED",
  );
});
