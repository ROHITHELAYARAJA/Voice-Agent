import { describe, expect, it } from "vitest";
import {
  reflectionInput,
  validatedReflection,
} from "../../services/journal-processor/src/reflection.ts";
import {
  dateWindow,
  voiceHistory,
} from "../../packages/wellness/src/insights.ts";
import { voiceFeatures } from "../../packages/wellness/src/catalog.ts";
import { scheduleInput } from "../../packages/validation/src/index.ts";
const base = {
  statements: [{ kind: "positive", quote: "I completed my project." }],
  mood_score: null,
  mood_evidence: "",
  user_turns: ["yes", "I completed my project."],
  summary_approved: true,
  generation: 1,
};
describe("approved voice wellness", () => {
  it("captures explicit liters and hours without inventing a mood", () => {
    const turns = ["I drank 1.8 liters of water.", "I slept 7 hours."];
    const input = reflectionInput.parse({
      ...base,
      user_turns: [...base.user_turns, ...turns],
      wellness: [
        { topic: "water", value: 1.8, unit: "L", quote: turns[0] },
        { topic: "sleep", value: 7, unit: "h", quote: turns[1] },
      ],
    });
    expect(validatedReflection(input).mood_score).toBeNull();
    expect(input.wellness).toHaveLength(2);
  });
  it.each([
    {
      topic: "sleep",
      value: 7,
      unit: "h",
      quote: "I drank 7 liters of water.",
    },
    {
      topic: "water",
      value: 1.8,
      unit: "L",
      quote: "I drank two glasses of water.",
    },
    { topic: "energy", value: 8, unit: "score", quote: "My mood is 8." },
    { topic: "sleep", value: 7, unit: "h", quote: "I slept seven hours." },
    {
      topic: "water",
      value: 7,
      unit: "L",
      quote: "I drank 2 liters of water and slept 7 hours.",
    },
    { topic: "sleep", value: 7, unit: "h", quote: "I didn't sleep 7 hours." },
  ])(
    "requires the stated topic, numeric value and correct unit",
    (observation) => {
      const input = reflectionInput.parse({
        ...base,
        user_turns: [...base.user_turns, observation.quote],
        wellness: [observation],
      });
      expect(() => validatedReflection(input)).toThrow();
    },
  );
  it("rejects unreported numbers, impossible values and foreign owner IDs", () => {
    expect(() =>
      reflectionInput.parse({ ...base, user_id: "another-user" }),
    ).toThrow();
    expect(() =>
      reflectionInput.parse({
        ...base,
        wellness: [
          { topic: "sleep", value: 27, unit: "h", quote: "I slept 27 hours." },
        ],
      }),
    ).toThrow();
    const input = reflectionInput.parse({
      ...base,
      wellness: [
        {
          topic: "water",
          value: 1.8,
          unit: "L",
          quote: "I drank 1.8 liters of water.",
        },
      ],
    });
    expect(() => validatedReflection(input)).toThrow();
  });
  it("requires separate memory permission, not just summary approval", () => {
    const memory = {
      topic: "memory",
      value: "quiet walks",
      quote: "I like quiet walks.",
      memory_permission: "yes",
    };
    const input = reflectionInput.parse({
      ...base,
      user_turns: [...base.user_turns, memory.quote, "yes"],
      wellness: [memory],
    });
    expect(() => validatedReflection(input)).toThrow();
    const approved = reflectionInput.parse({
      ...input,
      user_turns: [...input.user_turns, "Yes, remember this"],
      wellness: [{ ...memory, memory_permission: "Yes, remember this" }],
    });
    expect(() => validatedReflection(approved)).not.toThrow();
  });
  it("does not invent dates for reminder requests", () => {
    const input = reflectionInput.parse({
      ...base,
      user_turns: [...base.user_turns, "Remind me tomorrow."],
      wellness: [
        {
          topic: "reminder",
          value: "tomorrow",
          quote: "Remind me tomorrow.",
          due_at: "2026-10-14T20:00:00+05:30",
        },
      ],
    });
    expect(() => validatedReflection(input)).toThrow();
  });
  it("keeps missing dates empty and uses the owner's time zone", () => {
    expect(
      dateWindow("Asia/Kolkata", 2, 0, new Date("2026-10-12T20:00:00Z")),
    ).toEqual(["2026-10-12", "2026-10-13"]);
    expect(
      dateWindow("America/New_York", 2, 7, new Date("2026-10-12T20:00:00Z")),
    ).toEqual(["2026-10-04", "2026-10-05"]);
    expect(voiceHistory([])).toEqual([]);
  });
  it("defines exactly 32 features and evening-only calling", () => {
    expect(voiceFeatures).toHaveLength(32);
    expect(new Set(voiceFeatures.map((f) => f[0])).size).toBe(32);
    expect(
      scheduleInput.safeParse({
        local_time: "09:00",
        timezone: "Asia/Kolkata",
        weekdays: [1],
        enabled: false,
        phone_id: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
  });
});
