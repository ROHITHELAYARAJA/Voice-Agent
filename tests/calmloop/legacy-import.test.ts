import { describe, expect, it, vi } from "vitest";
import {
  importLegacyProviders,
  legacyCredentials,
} from "../../apps/api/src/legacy-import.ts";
describe("explicit owner provider import", () => {
  it("does not send any key when the session belongs to another owner", async () => {
    const api = vi.fn();
    await expect(
      importLegacyProviders("owner-one", "owner-two", [], api),
    ).rejects.toThrow("does not match");
    expect(api).not.toHaveBeenCalled();
  });
  it("preserves existing connections and stops on validation failure without retrying", async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({
        connections: [{ provider: "twilio", status: "connected" }],
      })
      .mockRejectedValueOnce(new Error("verification failed"));
    await expect(
      importLegacyProviders(
        "owner",
        "owner",
        [
          {
            provider: "twilio",
            account_sid: `AC${"a".repeat(32)}`,
            auth_token: "test-only-token",
            caller_number: "+15555550123",
          },
          { provider: "deepgram", api_key: "test-only-deepgram-key" },
          { provider: "elevenlabs", api_key: "test-only-elevenlabs-key" },
        ],
        api,
      ),
    ).rejects.toThrow("verification failed");
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[1]?.[1]?.provider).toBe("deepgram");
  });
  it("rejects incomplete local keys without revealing their contents", () => {
    expect(() =>
      legacyCredentials({ TWILIO_AUTH_TOKEN: "private-test-value" }),
    ).toThrow("Check the local twilio settings");
  });
});
