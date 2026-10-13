import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  signSession,
  verifySession,
} from "../../apps/api/src/security.ts";
import { nextOccurrence } from "../../services/call-worker/src/scheduling.ts";
import {
  reflectionInput,
  validatedReflection,
} from "../../services/journal-processor/src/reflection.ts";
import { weeklyRecap } from "../../services/journal-processor/src/insights.ts";
describe("credential and session boundaries", () => {
  const key = Buffer.alloc(32, 7);
  it("encrypts with unique nonces and authenticates the tenant, provider and reference", () => {
    const a = encrypt({ api_key: "secret" }, key, "alice", "deepgram", "ref");
    const b = encrypt({ api_key: "secret" }, key, "alice", "deepgram", "ref");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain("secret");
    expect(decrypt(a, key, "alice", "deepgram", "ref")).toEqual({
      api_key: "secret",
    });
    expect(() => decrypt(a, key, "bob", "deepgram", "ref")).toThrow();
    expect(() => decrypt(a, key, "alice", "twilio", "ref")).toThrow();
    expect(() =>
      decrypt(
        { ...a, tag: Buffer.alloc(16).toString("base64") },
        key,
        "alice",
        "deepgram",
        "ref",
      ),
    ).toThrow();
  });
  it("rejects tampered and expired capabilities", () => {
    const token = signSession("alice-call", "long-secret", 100000);
    expect(verifySession(token, "long-secret", 100000)).toBe("alice-call");
    expect(() => verifySession(token, "wrong-secret", 100000)).toThrow();
    expect(() =>
      verifySession(`${token}.extra`, "long-secret", 100000),
    ).toThrow();
    expect(() => verifySession(token, "long-secret", 1400000)).toThrow();
  });
});
describe("local time schedules", () => {
  it("maps India time to UTC and honors selected weekdays", () => {
    expect(
      nextOccurrence(
        "20:00",
        "Asia/Kolkata",
        [1],
        new Date("2026-10-12T13:00:00Z"),
      ).toISOString(),
    ).toBe("2026-10-12T14:30:00.000Z");
    expect(
      nextOccurrence(
        "20:00",
        "Asia/Kolkata",
        [1],
        new Date("2026-10-12T15:00:00Z"),
      ).toISOString(),
    ).toBe("2026-10-19T14:30:00.000Z");
  });
  it("skips nonexistent spring-forward times and sends once at the earlier fall-back occurrence", () => {
    expect(
      nextOccurrence(
        "02:30",
        "America/New_York",
        [7],
        new Date("2026-03-08T00:00:00Z"),
      ).toISOString(),
    ).toBe("2026-03-15T06:30:00.000Z");
    expect(
      nextOccurrence(
        "01:30",
        "America/New_York",
        [7],
        new Date("2026-11-01T00:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
    expect(
      nextOccurrence(
        "01:30",
        "America/New_York",
        [7],
        new Date("2026-11-01T06:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-08T06:30:00.000Z");
  });
});
describe("supported reflections", () => {
  const base = {
    statements: [
      {
        kind: "stress" as const,
        quote: "Work felt stressful today",
        topic: "work",
      },
    ],
    mood_score: null,
    mood_evidence: "",
    wellness: [],
    user_turns: ["Work felt stressful today"],
    summary_approved: true as const,
    generation: 1,
  };
  it("keeps the user's wording and rejects invented statements", () => {
    expect(validatedReflection(reflectionInput.parse(base)).topics).toEqual([
      "work",
    ]);
    expect(() =>
      validatedReflection({
        ...base,
        statements: [
          { kind: "stress", quote: "You have anxiety", topic: "anxiety" },
        ],
      }),
    ).toThrow();
    expect(() =>
      validatedReflection({
        ...base,
        mood_score: 7,
        mood_evidence: "I feel seven",
      }),
    ).toThrow();
    expect(() =>
      reflectionInput.parse({ ...base, summary_approved: false }),
    ).toThrow();
  });
  it("leaves the average unknown without reported moods", () => {
    expect(weeklyRecap([], []).average).toBeNull();
  });
});
