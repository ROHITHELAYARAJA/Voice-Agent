import { z } from "zod";
import {
  wellnessObservation,
  validateWellness,
} from "../../../packages/validation/src/wellness.ts";
export const reflectionInput = z
  .object({
    statements: z
      .array(
        z
          .object({
            kind: z.enum(["reflection", "positive", "intention", "stress"]),
            quote: z.string().trim().min(1).max(1500),
            topic: z.string().max(60).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    mood_score: z.number().int().min(1).max(10).nullable(),
    mood_evidence: z.string().max(500),
    user_turns: z.array(z.string().max(4000)).max(100),
    summary_approved: z.literal(true),
    generation: z.number().int().nonnegative(),
    wellness: z.array(wellnessObservation).max(32).default([]),
  })
  .strict();
export function validatedReflection(input: z.infer<typeof reflectionInput>) {
  validateWellness(input.wellness, input.user_turns);
  const wellnessMood = input.wellness.find((o) => o.topic === "mood");
  if (wellnessMood && wellnessMood.value !== input.mood_score)
    throw new Error("Conflicting mood values");
  const said = input.user_turns.join("\n");
  for (const item of input.statements) {
    if (!said.includes(item.quote)) throw new Error("Unsupported statement");
    if (
      item.topic &&
      !item.quote.toLocaleLowerCase().includes(item.topic.toLocaleLowerCase())
    )
      throw new Error("Unsupported topic");
    if (
      item.kind === "stress" &&
      !/stress|worr|difficult|overwhelm|exhaust|tough|pressure|மனஅழுத்த|கவலை|கஷ்ட|சிரம|तनाव|परेशान|चिंता|estrés|agot|difícil|inquiet|difficile|épuis|schwierig|sorge|belast/i.test(
        item.quote,
      )
    )
      throw new Error("Stress was not explicitly described");
  }
  if (
    input.mood_score !== null &&
    (!input.mood_evidence ||
      !said.includes(input.mood_evidence) ||
      !/mood|feeling|உணர்வு|மனநிலை|humeur|ánimo|stimmung|मूड/i.test(
        input.mood_evidence,
      ) ||
      !new RegExp(`(^|\\D)${input.mood_score}(\\D|$)`).test(
        input.mood_evidence,
      ))
  )
    throw new Error("Unsupported mood score");
  const unique = [...new Set(input.statements.map((s) => s.quote))];
  return {
    title: "Your nightly snapshot",
    reflection:
      "Your words from this check-in:\n\n" +
      unique.map((s) => `“${s}”`).join("\n\n"),
    topics: [
      ...new Set(
        input.statements
          .filter((s) => s.kind === "stress" && s.topic)
          .map((s) => s.topic!),
      ),
    ],
    mood_score: input.mood_score,
  };
}
