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
import { weeklyRecap } from "@nila/wellness";
import type { Dashboard } from "@nila/shared-types";
import { api, browserClient } from "@/lib/supabase";
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
  const moods = sampleDays.map((score, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 5 + i);
    return {
      id: `sample-${i}`,
      entry_date: date.toISOString().slice(0, 10),
      score,
      tags: [i === 4 ? "Grateful" : "Reflective"],
      source: "manual" as const,
    };
  });
  return {
    ...previewData,
    moods,
    journals: [
      {
        id: "sample-journal",
        entry_date: today.toISOString().slice(0, 10),
        title: "Finding little moments of calm",
        reflection:
          "Today felt full, but a short walk helped me feel more present. I want to make room for a quiet moment tomorrow.",
        user_edit: null,
        source: "manual",
        topics: ["work"],
        created_at: today.toISOString(),
      },
    ],
    activities: [
      {
        id: "sample-activity",
        activity_key: "breathe",
        completed_at: today.toISOString(),
      },
    ],
    challenge: Array.from({ length: 5 }, (_, i) => ({
      day: i + 1,
      status: "completed" as const,
      cycle: "sample",
    })),
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
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      try {
        const client = browserClient();
        const { data: sessionData } = await client.auth.getSession();
        const session = sessionData.session;
        if (!session || disposed) return;
        await client.realtime.setAuth(session.access_token);
        if (disposed) return;
        const channel = client
          .channel(`user:${session.user.id}`, { config: { private: true } })
          .on("broadcast", { event: "changed" }, () => {
            void refresh();
          })
          .subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") setLiveUpdateError("");
            else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status))
              setLiveUpdateError(
                "Live updates are reconnecting. You can still use your space and refresh for the latest changes.",
              );
          });
        if (disposed) {
          void client.removeChannel(channel);
          return;
        }
        cleanup = () => {
          void client.removeChannel(channel);
        };
      } catch {
        if (!disposed)
          setLiveUpdateError(
            "Live updates are temporarily unavailable. Refresh to check for changes.",
          );
      }
    })();
    return () => {
      disposed = true;
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
