/**
 * Shared test helpers for Supabase Edge Functions.
 *
 * The Edge Functions are written for Deno (`Deno.serve`, `Deno.env.get`)
 * but we test them under Jest (Node). These helpers:
 *
 * 1. Install a mock `Deno` global that captures the handler passed to
 *    `Deno.serve()`.
 * 2. Register a mock `@supabase/supabase-js` via `jest.doMock` **after**
 *    `jest.resetModules()` so the mock is fresh on each `loadEdgeFunction()`
 *    call, then `require()` the Edge Function module.
 * 3. Provide a mock `fetch` for outbound API calls (e.g. NVIDIA NIM).
 *
 * Usage in a test file:
 *
 * ```ts
 * setMockEnv({ SUPABASE_URL: "..." });
 * setMockSupabaseClient(mockClient);
 * const handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");
 * const res = await handler(new Request("http://localhost/", { method: "GET" }));
 * expect(res.status).toBe(405);
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────────

export type TestRequestInit = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

// ── Module-level state ─────────────────────────────────────────────────

let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
let envMap: Record<string, string> = {};
let mockSupabaseClientInstance: any = null;
let originalFetch: typeof globalThis.fetch | undefined;

// ── Public helpers ─────────────────────────────────────────────────────

/**
 * Set the environment variables that `Deno.env.get()` should return.
 * Call *before* `loadEdgeFunction()`.
 */
export const setMockEnv = (env: Record<string, string>) => {
  envMap = { ...env };
};

/**
 * Register the mock Supabase client object that `createClient()` should return.
 * Call *before* `loadEdgeFunction()`.
 */
export const setMockSupabaseClient = (client: any) => {
  mockSupabaseClientInstance = client;
};

/**
 * Replace global `fetch` with a jest mock. Returns the mock so tests can
 * configure `mockResolvedValue` etc.
 */
export const mockFetch = (): jest.Mock => {
  const fn = jest.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fn as any;
  return fn;
};

/**
 * Restore the original `fetch`.
 */
export const restoreFetch = () => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = undefined;
  }
};

/**
 * Install a mock `Deno` global with `env.get` and `serve`.
 * `Deno.serve` captures the handler so the test can invoke it directly.
 *
 * Call in `beforeEach` or before `loadEdgeFunction`.
 */
export const installDenoMock = () => {
  capturedHandler = null;
  (globalThis as any).Deno = {
    env: {
      get: (key: string) => (key in envMap ? envMap[key] : undefined),
    },
    serve: (handler: (req: Request) => Promise<Response>) => {
      capturedHandler = handler;
    },
  };
};

/**
 * Remove the mock `Deno` global.
 */
export const removeDenoMock = () => {
  delete (globalThis as any).Deno;
};

/**
 * Load an Edge Function module and return its handler.
 *
 * Order of operations:
 *  1. `jest.resetModules()` — clear the module cache.
 *  2. `jest.doMock("@supabase/supabase-js")` — register the Supabase mock
 *     (uses the client set via `setMockSupabaseClient`).
 *  3. `require(modulePath)` — load the Edge Function; its top-level
 *     `Deno.serve(...)` call is intercepted and the handler is captured.
 *
 * The `modulePath` should use the `@/` alias (e.g.
 * `"@/supabase/functions/get-photo-url/index"`) which is resolved via
 * `moduleNameMapper` in `jest.config.js`.
 */
export const loadEdgeFunction = (
  modulePath: string,
): ((req: Request) => Promise<Response>) => {
  jest.resetModules();

  // Re-register the Supabase mock AFTER resetModules so it survives the cache clear.
  jest.doMock("@supabase/supabase-js", () => ({
    createClient: jest.fn(() => mockSupabaseClientInstance),
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(modulePath);

  if (!capturedHandler) {
    throw new Error(
      `Deno.serve was not called — the Edge Function at ${modulePath} may not have loaded correctly.`,
    );
  }

  return capturedHandler;
};

/**
 * Build a test `Request` object.
 */
export const makeRequest = (
  url: string,
  init: TestRequestInit = {},
): Request => {
  const { method = "GET", body, headers = {} } = init;
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!headers.hasOwnProperty("Content-Type")) {
      (opts.headers as Record<string, string>)["Content-Type"] =
        "application/json";
    }
  }
  return new Request(url, opts);
};

/**
 * Extract the JSON body from a Response.
 */
export const getJson = async (res: Response): Promise<any> => {
  return res.json();
};

/**
 * Extract a plain-text body from a Response.
 */
export const getText = async (res: Response): Promise<string> => {
  return res.text();
};
