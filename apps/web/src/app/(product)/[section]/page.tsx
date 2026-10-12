import { notFound } from "next/navigation";
import { ProductPage } from "@/components/product-page";
import { sections } from "@/lib/routes";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as (typeof sections)[number])) notFound();
  return <ProductPage section={section} />;
}
