import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type GoogleCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  scopes: string[];
};

type EncryptedPayload = { iv: string; tag: string; ciphertext: string };

const dataDirectory = path.join(process.cwd(), ".data");
const credentialsPath = path.join(dataDirectory, "google-oauth.enc.json");

function encryptionKey() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
  return createHash("sha256").update(`persona-google-oauth:${secret}`).digest();
}

export async function saveGoogleCredentials(credentials: GoogleCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(credentialsPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
}

export async function loadGoogleCredentials(): Promise<GoogleCredentials | null> {
  try {
    const payload = JSON.parse(await readFile(credentialsPath, "utf8")) as EncryptedPayload;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as GoogleCredentials;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function clearGoogleCredentials() {
  await rm(credentialsPath, { force: true });
}
