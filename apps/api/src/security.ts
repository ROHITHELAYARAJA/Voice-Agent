import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export type Envelope = {
  version: string;
  iv: string;
  tag: string;
  ciphertext: string;
};
export function encrypt(
  value: unknown,
  key: Buffer,
  owner: string,
  provider: string,
  ref: string,
  version = "v1",
): Envelope {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${owner}:${provider}:${ref}:${version}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    version,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
export function decrypt<T>(
  value: Envelope,
  key: Buffer,
  owner: string,
  provider: string,
  ref: string,
): T {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(`${owner}:${provider}:${ref}:${value.version}`));
  cipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(value.ciphertext, "base64")),
      cipher.final(),
    ]).toString(),
  ) as T;
}
export function signSession(id: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      id,
      exp: Math.floor(now / 1000) + 1200,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): string {
  const [payload, signature] = token.split(".");
  if (
    !payload ||
    !signature ||
    token.split(".").length !== 2 ||
    token.length > 500
  )
    throw new Error("Invalid capability");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    throw new Error("Invalid capability");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    id: string;
    exp: number;
  };
  if (
    !Number.isFinite(value.exp) ||
    value.exp < now / 1000 ||
    value.exp > now / 1000 + 1201
  )
    throw new Error("Expired capability");
  return value.id;
}
