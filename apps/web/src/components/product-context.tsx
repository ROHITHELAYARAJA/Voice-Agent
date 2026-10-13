"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { dateWindow, weeklyRecap } from "@nila/wellness";
import type { Dashboard } from "@nila/shared-types";
import { api, browserClient } from "@/lib/supabase";
import { watchDashboard } from "@/lib/live-dashboard";
const previewData: Dashboard = {
  profile: {
    display_name: "Rohith",
    timezone: "Asia/Kolkata",
    onboarding_complete: true,
  },
  moods: [],
  journals: [],
  calls: [],
  connections: [],
  schedules: [],
  activities: [],
  challenge: [],
  preferences: {
    language: "en",
    voice_id: "cgSgspJ2msm6clMCkdW9",
    retain_transcript: false,
    retention_days: 30,
  },
  consent: false,
  phones: [],
  recap: { average: null, reportedDays: 0, topics: [] },
};
export const sampleDays = [5, 6, 7, 6, 8, 7];
function sampleData(): Dashboard {
  const today = new Date();
  const days = dateWindow("Asia/Kolkata", 16);
  const moods = days
    .filter((_, i) => i !== 5 && i !== 11)
    .map((date, i) => {
      const score = sampleDays[i % sampleDays.length]!;
      return {
        id: `sample-${i}`,
        entry_date: date,
        score,
        tags: [i === 4 ? "Grateful" : "Reflective"],
        source: "voice" as const,
      };
    });
  return {
    ...previewData,
    moods,
    journals: moods
      .map((mood, i) => ({
        id: `sample-journal-${i}`,
        entry_date: mood.entry_date,
        title: "Your nightly snapshot",
        reflection:
          "I felt happy, a little tired. I completed my project. A walk helped me unwind.",
        statements: [
          {
            kind: "reflection" as const,
            quote: "I felt happy, a little tired.",
          },
          { kind: "positive" as const, quote: "I completed my project." },
        ],
        user_edit: null,
        source: "voice" as const,
        topics: [],
        created_at: `${mood.entry_date}T14:30:00Z`,
        wellness: [
          {
            topic: "mood" as const,
            value: mood.score,
            unit: "score" as const,
            quote: `My mood is ${mood.score} out of 10.`,
          },
          {
            topic: "water" as const,
            value:
              i === moods.length - 1
                ? 1.8
                : Number((1.2 + (i % 4) * 0.3).toFixed(1)),
            unit: "L" as const,
            quote: `I drank ${i === moods.length - 1 ? 1.8 : (1.2 + (i % 4) * 0.3).toFixed(1)} liters of water.`,
          },
          {
            topic: "sleep" as const,
            value: i === moods.length - 1 ? 7 : 5 + (i % 4),
            unit: "h" as const,
            quote: `I slept ${i === moods.length - 1 ? 7 : 5 + (i % 4)} hours.`,
          },
          {
            topic: "energy" as const,
            value: 4 + (i % 5),
            unit: "score" as const,
            quote: `My energy is ${4 + (i % 5)} out of 10.`,
          },
          {
            topic: "screen_time" as const,
            value: 2 + (i % 3),
            unit: "h" as const,
            quote: `My screen time was ${2 + (i % 3)} hours.`,
          },
          {
            topic: "achievement" as const,
            value: "I completed my project.",
            quote: "I completed my project.",
          },
          {
            topic: "gratitude" as const,
            value: "a quiet evening",
            quote: "I'm grateful for a quiet evening.",
          },
          {
            topic: "activity" as const,
            value: "a short walk",
            quote: "I went for a short walk.",
          },
        ],
      }))
      .reverse(),
    schedules: [
      {
        id: "sample-schedule",
        enabled: true,
        local_time: "20:00",
        timezone: "Asia/Kolkata",
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        next_call_at_utc: null,
      },
    ],
    calls: [
      {
        id: "sample-call",
        status: "completed",
        created_at: today.toISOString(),
        finished_at: today.toISOString(),
      },
    ],
    memories: [],
    recap: {
      average: 6.5,
      reportedDays: 6,
      topics: [{ topic: "work", count: 1 }],
    },
  };
}
type Value = {
  data: Dashboard | null;
  loading: boolean;
  error: string;
  liveUpdateError: string;
  preview: boolean;
  refresh: () => Promise<void>;
  mutate: <T>(path: string, body?: unknown, method?: string) => Promise<T>;
  setSample: (data: Dashboard) => void;
};
const Context = createContext<Value | null>(null);
export function ProductProvider({
  children,
  preview = false,
}: {
  children: ReactNode;
  preview?: boolean;
}) {
  const [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [liveUpdateError, setLiveUpdateError] = useState("");
  const latestRequest = useRef(0);
  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      if (preview) {
        setData((current) => current ?? sampleData());
        return;
      }
      const result = await api<Dashboard>("/dashboard");
      if (requestId !== latestRequest.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (requestId !== latestRequest.current) return;
      setError(e instanceof Error ? e.message : "Your space could not load.");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [preview]);
  useEffect(() => {
    void refresh();
    return () => {
      ++latestRequest.current;
    };
  }, [refresh]);
  const hasData = data !== null;
  useEffect(() => {
    if (preview || !hasData) return;
    const controller = new AbortController();
    let cleanup = () => {};
    void watchDashboard(
      browserClient(),
      refresh,
      setLiveUpdateError,
      controller.signal,
    )
      .then((stop) => {
        cleanup = stop;
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLiveUpdateError(
            "Live updates are temporarily unavailable. Refresh to check for changes.",
          );
      });
    return () => {
      controller.abort();
      cleanup();
    };
  }, [refresh, preview, hasData]);
  const mutate = useCallback(
    async <T,>(path: string, body?: unknown, method = "POST"): Promise<T> => {
      if (preview)
        throw new Error(
          "This is a public preview. Create an account to save private data or place calls.",
        );
      const result = await api<T>(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await refresh();
      return result;
    },
    [preview, refresh],
  );
  return (
    <Context.Provider
      value={{
        data,
        loading,
        error,
        liveUpdateError,
        preview,
        refresh,
        mutate,
        setSample: (value) =>
          setData({
            ...value,
            recap: weeklyRecap(value.moods, value.journals),
          }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useProduct() {
  const value = useContext(Context);
  if (!value) throw new Error("Product provider missing");
  return value;
}
