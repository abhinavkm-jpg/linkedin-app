import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Symmetric encryption for secrets stored in the database. The key is derived
 * from AUTH_SECRET (or SETTINGS_SECRET), so no extra service is required.
 * Format: v1:<iv b64>:<tag b64>:<ciphertext b64>.
 */
function key(): Buffer {
  const secret = process.env.SETTINGS_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET (or SETTINGS_SECRET) must be set to encrypt settings");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return payload; // treat as plaintext
  const [, ivB, tagB, dataB] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
