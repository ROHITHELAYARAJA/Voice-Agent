import { z } from "zod";

export const wellnessTopics = [
  "mood",
  "water",
  "sleep",
  "health",
  "energy",
  "stress",
  "nutrition",
  "activity",
  "habits",
  "goals",
  "achievement",
  "gratitude",
  "journal",
  "memory",
  "motivation",
  "encouragement",
  "self_care",
  "health_information",
  "medication_reminder",
  "reminder",
  "patterns",
  "challenge",
  "social",
  "mindfulness",
  "screen_time",
  "follow_up",
  "preferences",
  "support",
] as const;

export const metricRules = {
  mood: {
    unit: "score",
    max: 10,
    min: 1,
    terms: /mood|feeling|மனநிலை|உணர்வு|मूड|humeur|ánimo|stimmung/i,
  },
  water: {
    unit: "L",
    max: 20,
    min: 0,
    terms: /water|lit(er|re)|தண்ணீர்|நீர்|லிட்டர்|पानी|agua|eau|wasser/i,
  },
  sleep: {
    unit: "h",
    max: 24,
    min: 0,
    terms: /sleep|slept|தூக்க|தூங்கி|नींद|सोया|dorm|sommeil|schlaf/i,
  },
  energy: {
    unit: "score",
    max: 10,
    min: 1,
    terms: /energy|ஆற்றல்|சக்தி|ऊर्जा|energ|énergie/i,
  },
  screen_time: {
    unit: "h",
    max: 24,
    min: 0,
    terms: /screen|phone|திரை|போன்|स्क्रीन|pantalla|écran|bildschirm/i,
  },
} as const;

export const wellnessObservation = z
  .object({
    topic: z.enum(wellnessTopics),
    value: z.union([
      z.number().finite(),
      z.string().trim().min(1).max(1000),
      z.boolean(),
    ]),
    unit: z.enum(["L", "h", "score"]).optional(),
    quote: z.string().trim().min(1).max(1500),
    memory_permission: z.string().trim().min(1).max(500).optional(),
    due_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((observation, ctx) => {
    const rule = metricRules[observation.topic as keyof typeof metricRules];
    if (rule) {
      if (
        typeof observation.value !== "number" ||
        observation.unit !== rule.unit ||
        observation.value < rule.min ||
        observation.value > rule.max ||
        (rule.unit === "score" && !Number.isInteger(observation.value))
      )
        ctx.addIssue({
          code: "custom",
          message: "Explicit numeric value and correct unit required",
        });
    } else if (typeof observation.value !== "string" || observation.unit)
      ctx.addIssue({
        code: "custom",
        message: "A faithful textual observation is required",
      });
    if (observation.topic === "memory" && !observation.memory_permission)
      ctx.addIssue({
        code: "custom",
        message: "Separate memory permission required",
      });
    if (observation.topic !== "memory" && observation.memory_permission)
      ctx.addIssue({
        code: "custom",
        message: "Memory permission only applies to memory",
      });
    if (
      observation.due_at &&
      !["reminder", "medication_reminder"].includes(observation.topic)
    )
      ctx.addIssue({
        code: "custom",
        message: "Dates only apply to reminders",
      });
  });

export type WellnessObservation = z.infer<typeof wellnessObservation>;

export function validateWellness(
  observations: WellnessObservation[],
  turns: string[],
) {
  const metrics = new Set<string>();
  for (const observation of observations) {
    if (!turns.some((turn) => turn.includes(observation.quote)))
      throw new Error("Unsupported wellness quote");
    const rule = metricRules[observation.topic as keyof typeof metricRules];
    if (rule) {
      if (metrics.has(observation.topic))
        throw new Error("Keep only the corrected metric value");
      metrics.add(observation.topic);
      if (
        Object.entries(metricRules).some(
          ([topic, other]) =>
            topic !== observation.topic && other.terms.test(observation.quote),
        ) ||
        /\b(no|not|didn't|wasn't|never)\b|இல்லை|இல்ல|नहीं/i.test(
          observation.quote,
        )
      )
        throw new Error("Clarify one affirmative metric at a time");
      if (/\b(or|maybe|not sure)\b|அல்லது|தெரியவில்லை/i.test(observation.quote))
        throw new Error("Uncertain value needs clarification");
      const numbers =
        observation.quote
          .match(/\d+(?:[.,]\d+)?/g)
          ?.map((value) => Number(value.replace(",", "."))) ?? [];
      if (
        !rule.terms.test(observation.quote) ||
        !numbers.includes(observation.value as number)
      )
        throw new Error(
          "Clarify the metric in the user's own words; do not convert or infer it",
        );
      if (
        rule.unit === "h" &&
        !/hours?|hrs?|மணி|घंट|heure|hora|stund/i.test(observation.quote)
      )
        throw new Error("Explicit hours required");
      if (
        rule.unit === "L" &&
        !/lit(er|re)|லிட்டர்|लीटर|litro|liter/i.test(observation.quote)
      )
        throw new Error("Explicit liters required");
    } else if (
      !observation.quote
        .toLocaleLowerCase()
        .includes(String(observation.value).toLocaleLowerCase())
    )
      throw new Error("Text must come from the user's words");
    if (
      observation.topic === "memory" &&
      (!turns.includes(observation.memory_permission!) ||
        !/^(yes,? (please )?remember (this|that|it)|remember this|இதை நினைவில் வை|ஆம்.*நினைவில்)/i.test(
          observation.memory_permission!,
        ) ||
        /\b(not|don't|no|except|but)\b|வேண்டாம்|ஆனால்/i.test(
          observation.memory_permission!,
        ))
    )
      throw new Error("Explicit separate long-term memory permission required");
    if (observation.due_at && !observation.quote.includes(observation.due_at))
      throw new Error(
        "Confirm the full reminder timestamp; do not infer dates or time zones",
      );
  }
}
