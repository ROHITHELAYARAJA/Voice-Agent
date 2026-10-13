import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { watchDashboard } from "../../apps/web/src/lib/live-dashboard.ts";

describe("private live dashboard updates", () => {
  it("authenticates the owner's private channel and reloads JSON without navigation", async () => {
    let changed = () => {};
    let status = (_status: string) => {};
    const channel = {
      on: vi.fn((_type, _event, callback) => {
        changed = callback;
        return channel;
      }),
      subscribe: vi.fn((callback) => {
        status = callback;
        return channel;
      }),
    };
    const client = {
      auth: {
        getSession: async () => ({
          data: {
            session: { access_token: "owner-token", user: { id: "owner-id" } },
          },
        }),
      },
      realtime: { setAuth: vi.fn() },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    const controller = new AbortController();
    const refresh = vi.fn(async () => {});
    const onError = vi.fn();
    const stop = await watchDashboard(
      client as unknown as SupabaseClient,
      refresh,
      onError,
      controller.signal,
    );
    expect(client.realtime.setAuth).toHaveBeenCalledWith("owner-token");
    expect(client.channel).toHaveBeenCalledWith("user:owner-id", {
      config: { private: true },
    });
    expect(channel.on).toHaveBeenCalledWith(
      "broadcast",
      { event: "changed" },
      expect.any(Function),
    );
    changed();
    expect(refresh).toHaveBeenCalledTimes(1);
    status("CHANNEL_ERROR");
    expect(onError).toHaveBeenLastCalledWith(
      expect.stringContaining("reconnecting"),
    );
    status("SUBSCRIBED");
    expect(onError).toHaveBeenLastCalledWith("");
    controller.abort();
    changed();
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
  it("never joins a channel after logout or cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const channel = vi.fn();
    await watchDashboard(
      {
        auth: { getSession: async () => ({ data: { session: null } }) },
        channel,
      } as unknown as SupabaseClient,
      vi.fn(),
      vi.fn(),
      controller.signal,
    );
    expect(channel).not.toHaveBeenCalled();
  });
});
