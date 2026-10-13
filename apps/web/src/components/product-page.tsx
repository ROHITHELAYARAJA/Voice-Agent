"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardView } from "./dashboard";
import { ViewBoundary } from "./product-views";
import { OnboardingView } from "./setup";
import { AdminView } from "./settings";
import { useProduct } from "./product-context";

export function ProductPage({ section }: { section: string }) {
  const { data, preview } = useProduct();
  const router = useRouter();
  useEffect(() => {
    if (
      data &&
      !preview &&
      !data.profile.onboarding_complete &&
      !["onboarding", "admin"].includes(section)
    )
      router.replace("/onboarding");
    else if (
      !preview &&
      !["dashboard", "onboarding", "admin"].includes(section)
    )
      router.replace("/dashboard");
  }, [data, preview, section, router]);
  return (
    <ViewBoundary>
      {section === "onboarding" ? (
        <OnboardingView />
      ) : section === "admin" ? (
        <AdminView />
      ) : (
        <DashboardView />
      )}
    </ViewBoundary>
  );
}
