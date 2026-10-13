import type { SupabaseClient } from "@supabase/supabase-js";

export async function watchDashboard(
  client: SupabaseClient,
  refresh: () => Promise<void>,
  onError: (message: string) => void,
  signal: AbortSignal,
) {
  const { data } = await client.auth.getSession();
  if (!data.session || signal.aborted) return () => {};
  await client.realtime.setAuth(data.session.access_token);
  if (signal.aborted) return () => {};
  const channel = client
    .channel(`user:${data.session.user.id}`, { config: { private: true } })
    .on("broadcast", { event: "changed" }, () => {
      if (!signal.aborted) void refresh();
    })
    .subscribe((status) => {
      if (signal.aborted) return;
      if (status === "SUBSCRIBED") onError("");
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status))
        onError(
          "Live updates are reconnecting. You can still use your space and refresh for the latest changes.",
        );
    });
  const cleanup = () => {
    void client.removeChannel(channel);
  };
  if (signal.aborted) cleanup();
  return cleanup;
}
