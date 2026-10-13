import { redirect } from "next/navigation";
import Link from "next/link";
import { serverClient } from "@/lib/server-supabase";
import { ProductProvider } from "@/components/product-context";
import { AppShell } from "@/components/app-shell";
import { Brand, Notice } from "@/components/ui";
export const metadata = { robots: { index: false, follow: false } };
export default async function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return (
      <main id="main" className="auth-card">
        <Brand />
        <h1>Your private space is almost ready.</h1>
        <Notice>
          The local app needs its Supabase connection before private sign-in can
          work. You can explore the clearly labelled product preview now.
        </Notice>
        <Link href="/preview" className="button">
          Explore the preview
        </Link>
        <Link href="/" className="text-button">
          Return home
        </Link>
      </main>
    );
  const client = await serverClient();
  if (!client) redirect("/auth");
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/auth");
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const roles = await client.from("account_roles").select("role");
  if (
    assurance.data?.currentLevel !== "aal2" &&
    (assurance.data?.nextLevel === "aal2" ||
      roles.data?.some((role) => role.role === "admin"))
  )
    redirect("/mfa");
  return (
    <ProductProvider>
      <AppShell>{children}</AppShell>
    </ProductProvider>
  );
}
