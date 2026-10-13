import { afterEach, it, expect, vi } from "vitest";
import {
  validateProvider,
  providerVerificationMessage,
} from "../../apps/api/src/providers.ts";
const twilio = {
  provider: "twilio" as const,
  account_sid: "AC" + "a".repeat(32),
  auth_token: "test-token",
  caller_number: "+14155550100",
};
afterEach(() => vi.unstubAllGlobals());
it("checks the customer's caller number and flags Trial streaming limits", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("IncomingPhoneNumbers")
              ? {
                  incoming_phone_numbers: [
                    {
                      phone_number: twilio.caller_number,
                      capabilities: { voice: true },
                    },
                  ],
                }
              : { type: "Trial", status: "active" },
          ),
          { status: 200 },
        ),
    ),
  );
  expect((await validateProvider(twilio)).capabilities).toMatchObject({
    media_streams: false,
  });
});
it("rejects an unowned caller number and revoked keys", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("IncomingPhoneNumbers")
              ? { incoming_phone_numbers: [] }
              : { type: "Full", status: "active" },
          ),
          { status: 200 },
        ),
    ),
  );
  await expect(validateProvider(twilio)).rejects.toThrow(
    "CALLER_NUMBER_NOT_AUTHORIZED",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
  await expect(
    validateProvider({ provider: "deepgram", api_key: "revoked" }),
  ).rejects.toThrow();
});
it("rejects a caller number without voice capability", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("IncomingPhoneNumbers")
              ? {
                  incoming_phone_numbers: [
                    {
                      phone_number: twilio.caller_number,
                      capabilities: { voice: false },
                    },
                  ],
                }
              : { type: "Full", status: "active" },
          ),
        ),
    ),
  );
  await expect(validateProvider(twilio)).rejects.toThrow(
    "CALLER_NUMBER_NOT_VOICE_ENABLED",
  );
});
it("stops validation before loading numbers for an inactive account", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ type: "Full", status: "suspended" })),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(validateProvider(twilio)).rejects.toThrow("ACCOUNT_NOT_ACTIVE");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("shows safe, actionable errors without returning provider response details", () => {
  expect(
    providerVerificationMessage(new Error("PROVIDER_HTTP_401"), "twilio"),
  ).toContain("Account SID and auth token");
  expect(
    providerVerificationMessage(
      new Error("CALLER_NUMBER_NOT_AUTHORIZED"),
      "twilio",
    ),
  ).toContain("does not belong to this account");
  expect(
    providerVerificationMessage(
      new DOMException("secret transport detail", "TimeoutError"),
      "deepgram",
    ),
  ).toContain("did not respond in time");
  expect(
    providerVerificationMessage(
      new Error("private provider response"),
      "elevenlabs",
    ),
  ).not.toContain("private provider response");
});
