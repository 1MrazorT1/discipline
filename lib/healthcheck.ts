import { supabase } from "./supabase";
import { env } from "./env";

/**
 * Result of a health check probe.
 */
export type HealthCheckResult = {
  ok: boolean;
  service: "supabase";
  latencyMs?: number;
  error?: string;
};

/**
 * Probe the Supabase REST endpoint to verify connectivity and credentials.
 *
 * This performs a lightweight `GET /rest/v1/` request (which does not require
 * authentication) against the configured Supabase URL. It is used in:
 * - Settings screen "Test Connection" button
 * - CI / integration tests that need to verify the Supabase backend is reachable
 *
 * @param timeoutMs  Max time to wait for a response before treating it as failed.
 */
export const checkSupabaseConnection = async (
  timeoutMs = 5000,
): Promise<HealthCheckResult> => {
  if (!env.supabaseUrl) {
    return { ok: false, service: "supabase", error: "Supabase URL is not configured." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();

  try {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        service: "supabase",
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return { ok: true, service: "supabase", latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const message =
      err?.name === "AbortError"
        ? `Timeout after ${timeoutMs}ms`
        : err?.message ?? "Unknown error";

    return { ok: false, service: "supabase", latencyMs, error: message };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Run a full health check against all configured services.
 * Returns an array of results so callers can check individual services.
 */
export const runHealthChecks = async (
  timeoutMs = 5000,
): Promise<HealthCheckResult[]> => {
  const results: HealthCheckResult[] = [];
  results.push(await checkSupabaseConnection(timeoutMs));
  return results;
};

/**
 * Convenience: returns `true` only when every service is healthy.
 */
export const isSystemHealthy = async (timeoutMs = 5000): Promise<boolean> => {
  const results = await runHealthChecks(timeoutMs);
  return results.every((r) => r.ok);
};
