import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/server-supabase";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code"),
    next = request.nextUrl.searchParams.get("next");
  const path =
    next && /^\/(dashboard|onboarding|auth(?:\?mode=update)?)$/.test(next)
      ? next
      : "/dashboard";
  const client = await serverClient();
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(path, request.url));
  }
  return NextResponse.redirect(new URL("/auth?error=callback", request.url));
}
