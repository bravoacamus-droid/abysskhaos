/**
 * Verifies a Telegram WebApp `initData` string per the spec at
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The check is:
 *   secret_key   = HMAC_SHA256("WebAppData", bot_token)
 *   data_check   = sorted(key=value\n... excluding `hash` and `signature`)
 *   computed_hex = HMAC_SHA256(data_check, secret_key) → hex
 *   computed_hex === provided hash  (constant-time)
 *
 * Plus: reject if `auth_date` is older than maxAgeSeconds (replay protection).
 *
 * Implemented with Web Crypto so it runs on Vercel Edge / Deno / Node 20+.
 */

export type TelegramInitUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
};

export type VerifiedInitData = {
  user: TelegramInitUser;
  authDate: number;
  raw: Record<string, string>;
};

export class InitDataError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "MISSING_HASH"
      | "BAD_HMAC"
      | "EXPIRED"
      | "MISSING_USER"
      | "MALFORMED",
  ) {
    super(message);
    this.name = "InitDataError";
  }
}

const encoder = new TextEncoder();

function toBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  // Copy into a fresh ArrayBuffer so the type matches BufferSource exactly.
  return input.slice().buffer as ArrayBuffer;
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const msg = toBuffer(encoder.encode(message));
  return crypto.subtle.sign("HMAC", cryptoKey, msg);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
): Promise<VerifiedInitData> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    throw new InitDataError("initData is not a valid query string", "MALFORMED");
  }

  const providedHash = params.get("hash");
  if (!providedHash) {
    throw new InitDataError("initData is missing `hash`", "MISSING_HASH");
  }

  const raw: Record<string, string> = {};
  const dataLines: string[] = [];
  const keys: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash" || key === "signature") continue;
    raw[key] = value;
    keys.push(key);
  }
  keys.sort();
  for (const key of keys) dataLines.push(`${key}=${raw[key]}`);
  const dataCheckString = dataLines.join("\n");

  // Telegram WebApp variant: secret = HMAC("WebAppData", bot_token).
  const secret = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const computed = await hmacSha256(secret, dataCheckString);
  const computedHex = bufferToHex(computed);

  if (!timingSafeEqualHex(computedHex, providedHash)) {
    throw new InitDataError("HMAC mismatch", "BAD_HMAC");
  }

  const authDateStr = raw["auth_date"];
  if (!authDateStr) {
    throw new InitDataError("Missing `auth_date`", "MALFORMED");
  }
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate)) {
    throw new InitDataError("`auth_date` is not a number", "MALFORMED");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > maxAgeSeconds) {
    throw new InitDataError(
      `auth_date too old (${nowSec - authDate}s > ${maxAgeSeconds}s)`,
      "EXPIRED",
    );
  }

  const userJson = raw["user"];
  if (!userJson) {
    throw new InitDataError("`user` field is missing", "MISSING_USER");
  }
  let user: TelegramInitUser;
  try {
    user = JSON.parse(userJson) as TelegramInitUser;
  } catch {
    throw new InitDataError("`user` field is not valid JSON", "MALFORMED");
  }
  if (typeof user.id !== "number" || typeof user.first_name !== "string") {
    throw new InitDataError("`user` is missing id or first_name", "MISSING_USER");
  }

  return { user, authDate, raw };
}
