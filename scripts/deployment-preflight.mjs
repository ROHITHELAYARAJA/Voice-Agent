import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const read = (path) =>
  existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
const backend = read(".env.calmloop");
const legacy = read(".env");
const frontend = read("apps/web/.env.local");
let missing = false;
for (const [label, settings, names] of [
  [
    "Backend",
    backend,
    [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "CREDENTIAL_ENCRYPTION_KEY",
      "VOICE_SESSION_SECRET",
      "INTERNAL_SERVICE_SECRET",
      "VOICE_PUBLIC_URL",
      "API_INTERNAL_URL",
      "WEB_ORIGIN",
    ],
  ],
  [
    "Website",
    frontend,
    [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_SITE_URL",
    ],
  ],
  [
    "Existing personal providers",
    legacy,
    [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "DEEPGRAM_API_KEY",
      "ELEVENLABS_API_KEY",
    ],
  ],
]) {
  console.log(label);
  for (const name of names) {
    const ready = Boolean(settings[name]);
    console.log(`  ${name}: ${ready ? "configured" : "missing"}`);
    if (!ready) missing = true;
  }
}
console.log(
  "Presence check only. Values are never printed; provider validity, HTTPS, consent and live deployment still require verification. Ngrok is needed only for local telephone testing.",
);
process.exitCode = missing ? 1 : 0;
