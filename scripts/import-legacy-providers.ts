import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  importLegacyProviders,
  legacyCredentials,
  LegacyImportError,
} from "../apps/api/src/legacy-import.ts";
async function main() {
  const { values } = parseArgs({
    options: {
      "session-file": { type: "string" },
      "owner-id": { type: "string" },
      confirm: { type: "boolean" },
    },
  });
  if (!values.confirm || !values["session-file"] || !values["owner-id"])
    throw new LegacyImportError(
      "Provide --session-file, --owner-id and --confirm. This imports existing keys into that verified account without placing calls.",
    );
  const owner = z.uuid().parse(values["owner-id"]);
  const settings = parseEnv(readFileSync(".env.calmloop", "utf8"));
  const legacy = legacyCredentials(parseEnv(readFileSync(".env", "utf8")));
  const session = z
    .object({ access_token: z.string().min(20) })
    .parse(JSON.parse(readFileSync(values["session-file"], "utf8")));
  const client = createClient(
    z.url().parse(settings.SUPABASE_URL),
    z.string().min(10).parse(settings.SUPABASE_PUBLISHABLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.getUser(session.access_token);
  if (error || !data.user?.email_confirmed_at)
    throw new LegacyImportError(
      "Use a current session from the verified Nila owner account.",
    );
  const apiUrl = new URL(settings.API_INTERNAL_URL ?? "http://127.0.0.1:4000");
  if (
    apiUrl.username ||
    apiUrl.password ||
    (apiUrl.protocol !== "https:" &&
      !(
        apiUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname)
      ))
  )
    throw new LegacyImportError(
      "The product API must use HTTPS or local loopback.",
    );
  await importLegacyProviders(
    owner,
    data.user.id,
    legacy,
    async <T>(path: string, body?: unknown) => {
      const result = await fetch(new URL(`/v1${path}`, apiUrl), {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      if (!result.ok)
        throw new LegacyImportError(
          `Import stopped at ${path} (HTTP ${result.status}). Check the backend's masked diagnostics or repair the connection in onboarding.`,
        );
      return (await result.json()) as T;
    },
  );
  console.log(
    "Provider import finished. Existing connections were left unchanged. Phone verification, consent and scheduling are still required; no call was placed.",
  );
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof z.ZodError
      ? "Check the owner ID, session file and local backend settings."
      : error instanceof LegacyImportError
        ? error.message
        : "Import did not finish. Check the local settings, session file and service connection. Diagnostic details are suppressed to protect credentials.",
  );
  process.exitCode = 1;
});
