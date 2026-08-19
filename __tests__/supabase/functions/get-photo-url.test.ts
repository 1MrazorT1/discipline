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

// Default env that satisfies the function's configuration check
const DEFAULT_ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

// ── Mock Supabase client factories ──────────────────────────────────────

function createMockStorage(
  result:
    | { signedUrl: string }
    | { error: { message: string } } = {
      signedUrl: "https://signed.example.com/photo.jpg",
    },
) {
  // Supabase's createSignedUrl returns { data, error }
  const supabaseResult = "signedUrl" in result
    ? { data: result, error: null }
    : { data: null, error: result.error };
  return {
    from: jest.fn(() => ({
      createSignedUrl: jest.fn().mockResolvedValue(supabaseResult),
    })),
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
  storageResult = { signedUrl: "https://signed.example.com/photo.jpg" },
}: {
  authUser?: { id: string } | null;
  storageResult?:
    | { signedUrl: string }
    | { error: { message: string } };
} = {}) {
  return {
    storage: createMockStorage(storageResult),
    auth: createMockAuth(authUser),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("get-photo-url Edge Function", () => {
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
    it("should return 200 ok message for OPTIONS (CORS preflight)", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "OPTIONS",
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("should return 405 for GET requests", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", { method: "GET" }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(405);
      expect(body.error).toContain("Method not allowed");
    });

    it("should return 405 for DELETE requests", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "DELETE",
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(405);
    });
  });

  describe("environment configuration", () => {
    it("should return 500 when SUPABASE_URL is missing", async () => {
      setMockEnv({ SUPABASE_SERVICE_ROLE_KEY: "key" });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("configuration");
    });

    it("should return 500 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
      setMockEnv({ SUPABASE_URL: "https://test.supabase.co" });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("configuration");
    });
  });

  describe("request body validation", () => {
    it("should return 400 when body is not valid JSON", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        new Request("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: "not json",
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("valid JSON");
    });

    it("should return 400 when object_key is missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: {},
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("object_key");
    });

    it("should return 400 when object_key is an empty string", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(400);
      expect(body.error).toContain("object_key");
    });
  });

  describe("authentication", () => {
    it("should return 401 when Authorization header is missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("bearer token");
    });

    it("should pass non-Bearer Authorization value as the token to Supabase auth", async () => {
      // The function strips "Bearer " prefix but passes any other value as-is
      // to getUser(). If Supabase rejects it, we get 401.
      setMockSupabaseClient(
        buildMockClient({ authUser: null }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Basic abc123" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });

    it("should return 401 when Supabase auth rejects the token", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: null }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("authorization check", () => {
    it("should return 403 when object_key does not match the user's prefix", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user2/photo.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(403);
      expect(body.error).toContain("Unauthorized");
    });

    it("should return 403 when object_key has no user prefix", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "evil-path.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(403);
    });
  });

  describe("successful response", () => {
    it("should return a signed URL when all checks pass", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageResult: { signedUrl: "https://signed.example.com/photo.jpg" },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.signedUrl).toBe("https://signed.example.com/photo.jpg");
    });

    it("should return 500 when createSignedUrl returns an error", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageResult: { error: { message: "Storage error" } },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("signed photo URL");
    });

    it("should return 500 when createSignedUrl returns no signedUrl", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageResult: { error: { message: "No URL" } },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers on all responses", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-photo-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-photo-url", {
          method: "POST",
          body: { object_key: "meals/user1/photo.jpg" },
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
