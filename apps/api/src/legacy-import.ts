import { providerInput } from "../../../packages/validation/src/index.ts";
import type { Credentials } from "./providers.ts";
export class LegacyImportError extends Error {}
export function legacyCredentials(
  values: Record<string, string | undefined>,
): Credentials[] {
  return [
    {
      provider: "twilio",
      account_sid: values.TWILIO_ACCOUNT_SID,
      auth_token: values.TWILIO_AUTH_TOKEN,
      caller_number: values.TWILIO_PHONE_NUMBER,
    },
    { provider: "deepgram", api_key: values.DEEPGRAM_API_KEY },
    { provider: "elevenlabs", api_key: values.ELEVENLABS_API_KEY },
  ].map((value) => {
    const result = providerInput.safeParse(value);
    if (!result.success)
      throw new LegacyImportError(
        `Check the local ${value.provider} settings before importing.`,
      );
    return result.data;
  });
}
export async function importLegacyProviders(
  expectedOwner: string,
  authenticatedOwner: string,
  values: Credentials[],
  api: <T>(path: string, body?: unknown) => Promise<T>,
) {
  if (expectedOwner !== authenticatedOwner)
    throw new LegacyImportError(
      "The signed-in account does not match the explicitly selected owner. Nothing was imported.",
    );
  const dashboard = await api<{
    connections: { provider: string; status: string }[];
  }>("/dashboard");
  for (const value of values) {
    if (
      dashboard.connections.some(
        (connection) => connection.provider === value.provider,
      )
    )
      continue;
    await api("/providers", value);
  }
}
