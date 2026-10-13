import { ProductProvider } from "@/components/product-context";
import { AppShell } from "@/components/app-shell";
import { ProductPage } from "@/components/product-page";
export const metadata = {
  title: "Explore your Nila space",
  robots: { index: false, follow: false },
};
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return (
    <ProductProvider preview>
      <AppShell view={view ?? "dashboard"}>
        <ProductPage section={view ?? "dashboard"} />
      </AppShell>
    </ProductProvider>
  );
}
