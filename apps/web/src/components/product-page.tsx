"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardView } from "./dashboard";
import {
  CallsView,
  ChallengeView,
  InsightsView,
  JournalsView,
  MoodsView,
  RecapView,
  SelfCareView,
  ViewBoundary,
} from "./product-views";
import { OnboardingView, ScheduleForm } from "./setup";
import { AdminView, SettingsView } from "./settings";
import { useProduct } from "./product-context";

export function ProductPage({ section }: { section: string }) {
  const { data, preview } = useProduct();
  const router = useRouter();
  useEffect(() => {
    if (
      data &&
      !preview &&
      !data.profile.onboarding_complete &&
      !["onboarding", "settings", "admin"].includes(section)
    )
      router.replace("/onboarding");
  }, [data, preview, section, router]);
  const views: Record<string, React.ReactNode> = {
    dashboard: <DashboardView />,
    journals: <JournalsView />,
    moods: <MoodsView />,
    insights: <InsightsView />,
    "self-care": <SelfCareView />,
    challenge: <ChallengeView />,
    recap: <RecapView />,
    calls: <CallsView />,
    schedule: (
      <>
        <div className="section-title">
          <div>
            <span className="eyebrow">CHECK IN ON YOUR TERMS</span>
            <h1>Make a little time for you</h1>
          </div>
        </div>
        <ScheduleForm />
      </>
    ),
    settings: <SettingsView />,
    onboarding: <OnboardingView />,
    admin: <AdminView />,
  };
  return <ViewBoundary>{views[section] ?? views.dashboard}</ViewBoundary>;
}
