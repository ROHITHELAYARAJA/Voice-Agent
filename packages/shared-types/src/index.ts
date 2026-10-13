export type CallStatus =
  | "queued"
  | "sending"
  | "uncertain"
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed"
  | "canceled";
export type Provider = "twilio" | "deepgram" | "elevenlabs";
export type Mood = {
  id: string;
  entry_date: string;
  score: number;
  tags: string[];
  source: "manual" | "voice";
};
export type Journal = {
  wellness?: import("../../validation/src/wellness.ts").WellnessObservation[];
  statements?: {
    kind: "reflection" | "positive" | "intention" | "stress";
    quote: string;
    topic?: string;
  }[];
  id: string;
  entry_date: string;
  title: string;
  reflection: string;
  user_edit: string | null;
  source: "voice" | "manual";
  topics: string[];
  created_at: string;
};
export type Call = {
  id: string;
  status: CallStatus;
  created_at: string;
  finished_at: string | null;
};
export type Connection = {
  provider: Provider;
  status: "connected" | "disconnected" | "failed";
  label: string;
  verified_at: string | null;
  capabilities: Record<string, unknown>;
};
export type Schedule = {
  id: string;
  local_time: string;
  timezone: string;
  weekdays: number[];
  enabled: boolean;
  next_call_at_utc: string | null;
};
export type Dashboard = {
  profile: {
    email?: string;
    display_name: string;
    timezone: string;
    onboarding_complete: boolean;
  };
  moods: Mood[];
  memories?: { id: string; value: string; quote: string; created_at: string }[];
  journals: Journal[];
  calls: Call[];
  connections: Connection[];
  schedules: Schedule[];
  activities: { id: string; activity_key: string; completed_at: string }[];
  challenge: { day: number; status: "completed" | "skipped"; cycle: string }[];
  preferences: {
    language: string;
    voice_id: string;
    retain_transcript: boolean;
    retention_days: number;
  } | null;
  consent: boolean;
  phones: { id: string; masked_number: string; verified_at: string }[];
  recap: {
    average: number | null;
    reportedDays: number;
    topics: { topic: string; count: number }[];
  };
};
