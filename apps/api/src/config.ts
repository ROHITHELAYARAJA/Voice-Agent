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
  VOICE_PUBLIC_URL: z.url().refine((v) => new URL(v).protocol === "https:"),
  WEB_ORIGIN: z.url(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});
export type Environment = z.infer<typeof environment>;
export function configuration() {
  return environment.parse(process.env);
}
