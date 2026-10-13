import type { z } from "zod";
import { providerInput } from "../../../packages/validation/src/index.ts";
export type Credentials = z.infer<typeof providerInput>;
export function providerVerificationMessage(
  error: unknown,
  provider: Credentials["provider"],
) {
  const code = error instanceof Error ? error.message : "";
  const name =
    provider === "twilio"
      ? "Twilio"
      : provider === "deepgram"
        ? "Deepgram"
        : "ElevenLabs";
  if (code === "PROVIDER_HTTP_401")
    return provider === "twilio"
      ? "Twilio rejected the Account SID and auth token. Copy both live credentials from the same Twilio account and try again."
      : `${name} rejected the API key. Check that the key is current and try again.`;
  if (code === "PROVIDER_HTTP_403")
    return `${name} denied access. Check this key's permissions and the account's restrictions.`;
  if (code === "TRIAL_MEDIA_STREAMS_UNAVAILABLE")
    return "Twilio accepted your credentials, but this is a trial account. Its sample calls use a Twilio demo; trial accounts block Media Streams, which Nila needs for Deepgram and ElevenLabs. Nila telephone calls require an upgraded account with a voice-enabled caller number.";
  if (code === "CALLER_NUMBER_NOT_AUTHORIZED")
    return "Twilio accepted your credentials, but the caller number does not belong to this account. Use a number from Phone Numbers > Active numbers in the same account as your SID.";
  if (code === "CALLER_NUMBER_NOT_VOICE_ENABLED")
    return "This Twilio number does not support voice calls. Choose a voice-enabled number from the same account.";
  if (code === "ACCOUNT_NOT_ACTIVE")
    return "Your Twilio account is not active. Check its status in Twilio Console before reconnecting.";
  if (code === "NO_VOICES_AVAILABLE")
    return "ElevenLabs accepted your key, but no voices are available. Check voice access for this key.";
  if (code === "PROVIDER_HTTP_429")
    return `${name} is limiting requests. Wait a minute before trying again.`;
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return `${name} did not respond in time. Try again shortly.`;
  return `${name} could not verify this connection. Try again, then check the provider's status and account permissions.`;
}
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
    if (result.status !== "active") throw new Error("ACCOUNT_NOT_ACTIVE");
    if (result.type === "Trial")
      throw new Error("TRIAL_MEDIA_STREAMS_UNAVAILABLE");
    const numbers = await providerRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${value.account_sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(value.caller_number)}`,
      twilioHeaders(value),
    );
    const caller = (
      numbers.incoming_phone_numbers as
        | { phone_number: string; capabilities?: { voice?: boolean } }[]
        | undefined
    )?.find((n) => n.phone_number === value.caller_number);
    if (!caller) throw new Error("CALLER_NUMBER_NOT_AUTHORIZED");
    if (caller.capabilities?.voice !== true)
      throw new Error("CALLER_NUMBER_NOT_VOICE_ENABLED");
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
