import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../apps/web/src/lib/supabase";

vi.mock("../../apps/web/src/lib/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-session" } },
        error: null,
      }),
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("website API connection", () => {
  it("waits for a sleeping server without repeating a write", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const request = vi.fn(async (_url: string, options: RequestInit) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 60000));
      expect(options.signal?.aborted).toBe(false);
      return new Response(JSON.stringify({ saved: true }));
    });
    vi.stubGlobal("fetch", request);
    const result = api("/moods", {
      method: "POST",
      body: JSON.stringify({ score: 7 }),
    });
    await vi.advanceTimersByTimeAsync(60000);
    await expect(result).resolves.toEqual({ saved: true });
    expect(timeout).toHaveBeenCalledWith(90000);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not resend a timed-out write or claim that it was not saved", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", request);
    await expect(api("/moods", { method: "POST" })).rejects.toThrow(
      "Refresh to check whether your changes were saved",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves caller cancellation and never retries a failed connection", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", request);
    await expect(
      api("/providers", { method: "POST", signal: controller.signal }),
    ).rejects.toThrow("could not reach its server");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
