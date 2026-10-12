import type { z } from "zod";
import { providerInput } from "../../../packages/validation/src/index.ts";
export type Credentials = z.infer<typeof providerInput>;
export async function providerRequest(
  url: string,
  headers: Record<string, string>,
  method = "GET",
  body?: URLSearchParams,
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}
export function twilioHeaders(
  value: Extract<Credentials, { provider: "twilio" }>,
) {
  return {
    Authorization: `Basic ${Buffer.from(`${value.account_sid}:${value.auth_token}`).toString("base64")}`,
  };
}
export async function validateProvider(value: Credentials) {
  if (value.provider === "twilio") {
    const result = await providerRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${value.account_sid}.json`,
      twilioHeaders(value),
    );
    const numbers = await providerRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${value.account_sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(value.caller_number)}`,
      twilioHeaders(value),
    );
    if (
      !(
        numbers.incoming_phone_numbers as { phone_number: string }[] | undefined
      )?.some((n) => n.phone_number === value.caller_number)
    )
      throw new Error("CALLER_NUMBER_NOT_AUTHORIZED");
    if (result.status !== "active") throw new Error("ACCOUNT_NOT_ACTIVE");
    return {
      label: `Twilio •${value.account_sid.slice(-4)}`,
      capabilities: {
        media_streams: result.type === "Full",
        account_type: result.type,
      },
    };
  }
  if (value.provider === "deepgram") {
    await providerRequest("https://api.deepgram.com/v1/projects", {
      Authorization: `Token ${value.api_key}`,
    });
    return {
      label: `Deepgram •${value.api_key.slice(-4)}`,
      capabilities: {
        managed_llm: "gpt-4.1-mini",
        settings_probe_required: true,
      },
    };
  }
  const result = await providerRequest("https://api.elevenlabs.io/v1/voices", {
    "xi-api-key": value.api_key,
  });
  const voices =
    (result.voices as { voice_id: string; name: string }[] | undefined) ?? [];
  if (!voices.length) throw new Error("NO_VOICES_AVAILABLE");
  return {
    label: `ElevenLabs •${value.api_key.slice(-4)}`,
    capabilities: {
      voices: voices.map((v) => ({ id: v.voice_id, name: v.name })),
      model: "eleven_turbo_v2_5",
    },
  };
}
