import { z } from "zod";
export const supportedLanguages = [
  "auto",
  "en",
  "hi",
  "es",
  "fr",
  "de",
  "ta",
] as const;
export const moodInput = z
  .object({
    score: z.number().int().min(1).max(10),
    tags: z.array(z.string().trim().min(1).max(40)).max(8),
    entry_date: z.iso.date(),
  })
  .strict();
export const journalInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    reflection: z.string().trim().min(1).max(10000),
    topics: z.array(z.string().max(60)).max(10).default([]),
  })
  .strict();
export const scheduleInput = z
  .object({
    local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .transform((value) => [...new Set(value)]),
    enabled: z.boolean(),
    phone_id: z.uuid(),
  })
  .strict();
export const preferencesInput = z
  .object({
    language: z.enum(supportedLanguages),
    voice_id: z.string().regex(/^[a-zA-Z0-9_-]{10,80}$/),
    retain_transcript: z.boolean(),
    retention_days: z.number().int().min(1).max(90),
  })
  .strict();
export const consentInput = z
  .object({
    recurring_calls: z.boolean(),
    transcription: z.boolean(),
    adult: z.literal(true),
    recording: z.literal(false),
  })
  .strict();
export const onboardingInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("self_care"), adult: z.literal(true) }).strict(),
  z.object({ mode: z.literal("voice") }).strict(),
]);
export const providerInput = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("twilio"),
      account_sid: z.string().regex(/^AC[a-fA-F0-9]{32}$/),
      auth_token: z.string().min(20).max(128),
      caller_number: z.string().regex(/^\+[1-9]\d{7,14}$/),
    })
    .strict(),
  z
    .object({
      provider: z.literal("deepgram"),
      api_key: z.string().min(20).max(256),
    })
    .strict(),
  z
    .object({
      provider: z.literal("elevenlabs"),
      api_key: z.string().min(20).max(256),
    })
    .strict(),
]);
export const phoneInput = z
  .object({ phone_number: z.string().regex(/^\+[1-9]\d{7,14}$/) })
  .strict();
export const activities = [
  {
    key: "breathe",
    title: "A softer breath",
    description:
      "Breathe gently in for four counts and out for six. Return to your usual breathing if uncomfortable.",
    minutes: 2,
  },
  {
    key: "ground",
    title: "Come back to this moment",
    description:
      "Notice five things you see, four you can touch, and three you can hear.",
    minutes: 3,
  },
  {
    key: "gratitude",
    title: "One small good thing",
    description:
      "Write down a moment that felt kind, comforting, or simply okay.",
    minutes: 2,
  },
  {
    key: "walk",
    title: "A little fresh air",
    description:
      "If it feels comfortable and safe, step outside or stretch beside a window.",
    minutes: 5,
  },
  {
    key: "connect",
    title: "A kind connection",
    description:
      "Send someone you trust a simple hello. There is no pressure to explain everything.",
    minutes: 3,
  },
] as const;
export function challengeActivity(day: number) {
  return activities[(day - 1) % activities.length]!;
}
export const voiceCapabilities = {
  checked: "2026-10-12",
  automatic: ["en", "hi", "es", "fr", "de"],
  manual: ["en", "hi", "es", "fr", "de", "ta"],
  autoModel: "flux-general-multi",
  tamilModel: "nova-3",
  managedModel: "gpt-4.1-mini",
  voiceModel: "eleven_turbo_v2_5",
  runtimeVerificationRequired: true,
};
