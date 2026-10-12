import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./client";
let client: SupabaseClient | null = null;
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Account services are not connected yet. The owner needs to configure Supabase before sign-in is available.",
    );
  return (client ??= createClient());
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { data, error } = await browserClient().auth.getSession();
  if (error || !data.session) throw new Error("Please sign in to continue.");
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url)
    throw new Error(
      "Your account is signed in, but the private data service has not been connected yet. Please contact the app owner.",
    );
  let result: Response;
  try {
    result = await fetch(`${url.replace(/\/$/, "")}/v1${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
        ...options.headers,
      },
      cache: "no-store",
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Your private data service could not be reached. Please try again shortly. If this continues, the app owner needs to check the service connection.",
    );
  }
  const value = (await result
    .json()
    .catch(() => ({
      error:
        "The private data service returned an unexpected response. Please try again.",
    }))) as T & { error?: string };
  if (!result.ok)
    throw new Error(value.error ?? "The request did not finish. Please retry.");
  if (value.error) throw new Error(value.error);
  return value;
}
