import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest, headers: Headers) {
  let response = NextResponse.next({ request: { headers } });
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach((v) => request.cookies.set(v.name, v.value));
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request: { headers } });
          previous.forEach((v) => response.cookies.set(v));
          values.forEach((v) =>
            response.cookies.set(v.name, v.value, v.options),
          );
        },
      },
    },
  );
  await client.auth.getClaims();
  return response;
}
