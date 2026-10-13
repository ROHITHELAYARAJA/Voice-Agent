import { describe, expect, it } from "vitest";
import { environment } from "../../apps/api/src/config.ts";

describe("voice service URL configuration", () => {
  const schema = environment.shape.VOICE_PUBLIC_URL;

  it.each(["", "not-a-url", "http://voice.example.com"])(
    "rejects invalid voice URL %s without throwing during validation",
    (value) => {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
    },
  );

  it("accepts the Render HTTPS service address", () => {
    expect(
      schema.safeParse("https://nila-voice-staging.onrender.com").success,
    ).toBe(true);
  });
});
