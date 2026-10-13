import { z } from "zod";
export const environment = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  DATABASE_URL: z.string().min(10),
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32),
  VOICE_SESSION_SECRET: z.string().min(32),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  VOICE_PUBLIC_URL: z.url({
    protocol: /^https$/,
    error: "Set VOICE_PUBLIC_URL to the Render voice service HTTPS address",
  }),
  WEB_ORIGIN: z.url(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});
export type Environment = z.infer<typeof environment>;
export function configuration() {
  const result = environment.safeParse(process.env);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid or missing environment settings: ${fields.join(", ")}. Set them in Render's Environment settings and redeploy.`,
    );
  }
  return result.data;
}
