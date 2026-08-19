import { checkSupabaseConnection, runHealthChecks, isSystemHealthy } from "@/lib/healthcheck";

// We mock the env module so we can control the Supabase URL/key per test.
jest.mock("@/lib/env", () => ({
  env: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
}));

import { env } from "@/lib/env";

describe("healthcheck", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("checkSupabaseConnection", () => {
    it("should return ok=true when the REST endpoint responds 200", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      globalThis.fetch = mockFetch as any;

      const result = await checkSupabaseConnection(5000);

      expect(result.ok).toBe(true);
      expect(result.service).toBe("supabase");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("should return ok=false when SUPABASE_URL is not configured", async () => {
      (env as any).supabaseUrl = "";
      (env as any).supabaseAnonKey = "anon-key";

      const result = await checkSupabaseConnection(5000);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should return ok=false when HTTP response is not OK", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      globalThis.fetch = mockFetch as any;

      const result = await checkSupabaseConnection(5000);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("401");
    });

    it("should return ok=false when fetch throws a network error", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const mockFetch = jest
        .fn()
        .mockRejectedValue(new Error("ECONNREFUSED"));
      globalThis.fetch = mockFetch as any;

      const result = await checkSupabaseConnection(5000);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    });

    it("should return ok=false with timeout message on AbortError", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      const mockFetch = jest.fn().mockRejectedValue(abortError);
      globalThis.fetch = mockFetch as any;

      const result = await checkSupabaseConnection(100);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Timeout");
    });

    it("should pass correct headers to fetch", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "my-anon-key";

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      globalThis.fetch = mockFetch as any;

      await checkSupabaseConnection(5000);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.supabase.co/rest/v1/",
        expect.objectContaining({
          method: "GET",
          headers: {
            apikey: "my-anon-key",
            Authorization: "Bearer my-anon-key",
          },
        }),
      );
    });

    it("should respect the timeout parameter", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      // Simulate a request that takes longer than the timeout,
      // but respect the AbortSignal passed by checkSupabaseConnection.
      const mockFetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ ok: true, status: 200 }), 500);
          options?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
      globalThis.fetch = mockFetch as any;

      const result = await checkSupabaseConnection(50);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Timeout");
    }, 1000);
  });

  describe("runHealthChecks", () => {
    it("should return results for all services", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
      globalThis.fetch = mockFetch as any;

      const results = await runHealthChecks(5000);

      expect(results).toHaveLength(1);
      expect(results[0].service).toBe("supabase");
      expect(results[0].ok).toBe(true);
    });

    it("should return all failed when supabase is down", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const mockFetch = jest
        .fn()
        .mockRejectedValue(new Error("Connection refused"));
      globalThis.fetch = mockFetch as any;

      const results = await runHealthChecks(5000);

      expect(results[0].ok).toBe(false);
      expect(results[0].error).toContain("Connection refused");
    });
  });

  describe("isSystemHealthy", () => {
    it("should return true when all services are healthy", async () => {
      (env as any).supabaseUrl = "https://test.supabase.co";
      (env as any).supabaseAnonKey = "anon-key";

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      globalThis.fetch = mockFetch as any;

      const healthy = await isSystemHealthy(5000);
      expect(healthy).toBe(true);
    });

    it("should return false when any service is unhealthy", async () => {
      (env as any).supabaseUrl = "";
      (env as any).supabaseAnonKey = "anon-key";

      const healthy = await isSystemHealthy(5000);
      expect(healthy).toBe(false);
    });
  });
});
