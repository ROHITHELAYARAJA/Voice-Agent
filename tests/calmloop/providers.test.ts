import { afterEach, it, expect, vi } from "vitest";
import { validateProvider } from "../../apps/api/src/providers.ts";
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
                    { phone_number: twilio.caller_number },
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
