import { updateSession } from "./lib/middleware";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    request.nextUrl.hostname,
  );
  const destinations = [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ]
    .filter(Boolean)
    .map((url) => new URL(url!).origin);
  const realtime = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin.replace(
        /^https:/,
        "wss:",
      )
    : "";
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${destinations.join(" ")} ${realtime} ${dev ? "ws://127.0.0.1:3000 ws://localhost:3000" : ""}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';${dev || local ? "" : " upgrade-insecure-requests;"}`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  let response = NextResponse.next({ request: { headers } });
  function secure() {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    !url ||
    !key ||
    ["/", "/preview", "/privacy", "/robots.txt"].includes(
      request.nextUrl.pathname,
    )
  )
    return secure();
  response = await updateSession(request, headers);
  return secure();
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|woff2)$).*)",
  ],
};
