/**
 * Unit tests for the `get-photo-urls` Supabase Edge Function (batch signed URL
 * endpoint).
 */

import {
  installDenoMock,
  removeDenoMock,
  loadEdgeFunction,
  setMockEnv,
  setMockSupabaseClient,
  makeRequest,
  getJson,
  restoreFetch,
} from "./helpers";

const DEFAULT_ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

// ── Mock Supabase client factories ──────────────────────────────────────

/** Wrap a raw result into the Supabase { data, error } envelope. */
function wrapStorageResult(
  r: { signedUrl: string } | { error: { message: string } },
) {
  return "signedUrl" in r ? { data: r, error: null } : { data: null, error: r.error };
}

function createMockStorage(config: {
  defaultResult?: { signedUrl: string } | { error: { message: string } };
  results?: Array<{ signedUrl: string } | { error: { message: string } }>;
} = {}) {
  const { defaultResult, results } = config;
  const fallback = defaultResult ?? { signedUrl: "https://signed.example.com/photo.jpg" };

  if (results) {
    // Create a single createSignedUrl mock so all .from() calls share the
    // same mockResolvedValueOnce sequence.
    const createSignedUrl = jest.fn()
      .mockResolvedValueOnce(
        wrapStorageResult(results[0] ?? fallback),
      )
      .mockResolvedValueOnce(
        wrapStorageResult(results[1] ?? fallback),
      )
      .mockResolvedValueOnce(
        wrapStorageResult(results[2] ?? fallback),
      )
      .mockResolvedValue(wrapStorageResult(results[3] ?? fallback));

    return {
      from: jest.fn(() => ({ createSignedUrl })),
    };
  }

  const createSignedUrl = jest
    .fn()
    .mockResolvedValue(wrapStorageResult(fallback));
  return {
    from: jest.fn(() => ({ createSignedUrl })),
  };
}

function createMockAuth(user: { id: string } | null) {
  if (user) {
    return {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    };
  }
  return {
    getUser: jest.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("Invalid token"),
    }),
  };
}

function buildMockClient({
  authUser = { id: "user1" },
  storageConfig = {},
}: {
  authUser?: { id: string } | null;
  storageConfig?: Parameters<typeof createMockStorage>[0];
} = {}) {
  return {
    storage: createMockStorage(storageConfig),
    auth: createMockAuth(authUser),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("get-photo-urls Edge Function", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    setMockEnv(DEFAULT_ENV);
    installDenoMock();
  });

  afterEach(() => {
    removeDenoMock();
    restoreFetch();
    jest.dontMock("@supabase/supabase-js");
    jest.resetModules();
  });

  describe("HTTP method handling", () => {
    it("should return 200 for OPTIONS (CORS preflight)", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "OPTIONS",
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("should return 405 for GET requests", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", { method: "GET" }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(405);
      expect(body.error).toContain("Method not allowed");
    });
  });

  describe("environment configuration", () => {
    it("should return 500 when SUPABASE_URL is missing", async () => {
      setMockEnv({ SUPABASE_SERVICE_ROLE_KEY: "key" });
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"] },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("configuration");
    });

    it("should return 500 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
      setMockEnv({ SUPABASE_URL: "https://test.supabase.co" });
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"] },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
    });
  });

  describe("request body validation", () => {
    it("should return 400 when body is not valid JSON", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        new Request("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: "not json",
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("valid JSON");
    });

    it("should return 200 with empty urls when object_keys is missing", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: {},
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.urls).toEqual({});
    });

    it("should return 200 with empty urls when object_keys is empty array", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: { object_keys: [] },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.urls).toEqual({});
    });

    it("should deduplicate object_keys and filter out empty/non-string entries", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageConfig: {
            defaultResult: { signedUrl: "https://signed.example.com/photo.jpg" },
          },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: {
            object_keys: [
              "meals/user1/photo1.jpg",
              "meals/user1/photo1.jpg", // duplicate
              "meals/user1/photo2.jpg",
              "", // empty string should be filtered out
              null as any, // non-string should be filtered out
            ],
          },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(Object.keys(body.urls)).toHaveLength(2);
      expect(body.urls["meals/user1/photo1.jpg"]).toBe(
        "https://signed.example.com/photo.jpg",
      );
      expect(body.urls["meals/user1/photo2.jpg"]).toBe(
        "https://signed.example.com/photo.jpg",
      );
      expect(body.urls).not.toHaveProperty("");
    });
  });

  describe("authentication", () => {
    it("should return 401 when Authorization header is missing", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"] },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("bearer token");
    });

    it("should return 401 when token is invalid", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: null }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"] },
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("authorization check", () => {
    it("should return 403 when any object_key does not match user prefix", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo.jpg", "meals/user2/other.jpg"],
          },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(403);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("successful response", () => {
    it("should return signed URLs for all provided object keys", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageConfig: {
            defaultResult: { signedUrl: "https://signed.example.com/photo.jpg" },
          },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo1.jpg", "meals/user1/photo2.jpg"],
          },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.urls).toEqual({
        "meals/user1/photo1.jpg": "https://signed.example.com/photo.jpg",
        "meals/user1/photo2.jpg": "https://signed.example.com/photo.jpg",
      });
    });

    it("should return 500 when any createSignedUrl call fails", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageConfig: {
            results: [
              { signedUrl: "https://ok.example.com/p1.jpg" },
              { error: { message: "Storage error" } },
            ],
          },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: {
            object_keys: ["meals/user1/photo1.jpg", "meals/user1/photo2.jpg"],
          },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("signed photo URLs");
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers on 200 responses", async () => {
      setMockSupabaseClient(buildMockClient({ authUser: { id: "user1" } }));
      handler = loadEdgeFunction("@/supabase/functions/get-photo-urls/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-urls", {
          method: "POST",
          body: { object_keys: ["meals/user1/photo.jpg"] },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "authorization",
      );
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });
  });
});
