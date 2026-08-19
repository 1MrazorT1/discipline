/**
 * Unit tests for the `get-upload-url` Supabase Edge Function.
 *
 * Tests cover: HTTP method handling, environment checks, JWT verification,
 * safe extension sanitization, signed upload URL creation, and error paths.
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
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

// ── Mock Supabase client factories ──────────────────────────────────────

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

function createMockStorage(
  result:
    | { signedUrl: string; token?: string }
    | { error: { message: string } } = {
      signedUrl: "https://upload.example.com/signed",
    },
) {
  // Supabase's createSignedUploadUrl returns { data, error }
  const supabaseResult = "signedUrl" in result
    ? { data: result, error: null }
    : { data: null, error: result.error };
  return {
    from: jest.fn(() => ({
      createSignedUploadUrl: jest.fn().mockResolvedValue(supabaseResult),
    })),
  };
}

function buildMockClient({
  authUser = { id: "user1" },
  storageResult = {
    signedUrl: "https://upload.example.com/signed-url",
    token: "storage-token",
  },
}: {
  authUser?: { id: string } | null;
  storageResult?:
    | { signedUrl: string; token?: string }
    | { error: { message: string } };
} = {}) {
  return {
    auth: createMockAuth(authUser),
    storage: createMockStorage(storageResult),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("get-upload-url Edge Function", () => {
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
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
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
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", { method: "GET" }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(405);
      expect(body.error).toContain("Method not allowed");
    });

    it("should return 405 for DELETE requests", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "DELETE",
        }),
      );

      expect(res.status).toBe(405);
    });
  });

  describe("environment configuration", () => {
    it("should return 500 when SUPABASE_URL is missing", async () => {
      setMockEnv({
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { content_type: "image/jpeg", file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("upload configuration");
    });

    it("should return 500 when SUPABASE_ANON_KEY is missing", async () => {
      setMockEnv({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { content_type: "image/jpeg", file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("upload configuration");
    });

    it("should return 500 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
      setMockEnv({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
      });
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { content_type: "image/jpeg", file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("upload configuration");
    });
  });

  describe("authentication", () => {
    it("should return 401 when Authorization header is missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { content_type: "image/jpeg", file_ext: "jpg" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("bearer token");
    });

    it("should return 401 when token is rejected by Supabase", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: null }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { content_type: "image/jpeg", file_ext: "jpg" },
          headers: { Authorization: "Bearer invalid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(401);
      expect(body.error).toContain("Unauthorized");
    });
  });

  describe("request body parsing", () => {
    it("should handle missing body gracefully (default to empty object)", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const req = new Request("http://localhost:9000/get-upload-url", {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      });

      const res = await handler(req);
      const body = await getJson(res);
      // Should proceed with default extension "jpg"
      expect(res.status).toBe(200);
      expect(body.objectKey).toContain(".jpg");
    });

    it("should handle invalid JSON body gracefully", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        new Request("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: "not json",
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.objectKey).toContain(".jpg");
    });
  });

  describe("safeExtension", () => {
    it("should default to jpg when file_ext is missing", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { content_type: "image/jpeg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.objectKey).toMatch(/\.jpg$/);
    });

    it("should normalize jpeg to jpg", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpeg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.objectKey).toMatch(/\.jpg$/);
    });

    it("should sanitize extension by stripping non-alphanumeric chars", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg!!!???" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      // Non-alphanumeric chars stripped, leaving "jpg"
      expect(body.objectKey).toMatch(/\.jpg$/);
      // Verify no dangerous chars made it through
      expect(body.objectKey).not.toContain("<");
      expect(body.objectKey).not.toContain(">");
    });

    it("should lowercase the extension", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "PNG" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.objectKey).toMatch(/\.png$/);
    });

    it("should default to jpg for null extension", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: null },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.objectKey).toMatch(/\.jpg$/);
    });
  });

  describe("object key generation", () => {
    it("should generate object key with correct path format", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(body.objectKey).toMatch(/^meals\/user1\/[0-9a-f-]{36}\.jpg$/);
    });

    it("should generate unique object keys for each request", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res1 = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );
      const key1 = (await getJson(res1)).objectKey;

      const res2 = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );
      const key2 = (await getJson(res2)).objectKey;

      expect(key1).not.toBe(key2);
    });
  });

  describe("successful response", () => {
    it("should return uploadUrl and objectKey on success", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageResult: {
            signedUrl: "https://upload.example.com/signed-url",
            token: "storage-token",
          },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(200);
      expect(body.uploadUrl).toBe("https://upload.example.com/signed-url");
      expect(body.objectKey).toMatch(/^meals\/user1\/[0-9a-f-]{36}\.jpg$/);
    });
  });

  describe("storage errors", () => {
    it("should return 500 when createSignedUploadUrl returns an error", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageResult: { error: { message: "Bucket not found" } },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("signed upload URL");
    });

    it("should return 500 when createSignedUploadUrl returns no signedUrl", async () => {
      setMockSupabaseClient(
        buildMockClient({
          authUser: { id: "user1" },
          storageResult: { error: { message: "No URL" } },
        }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
    });
  });

  describe("unexpected errors", () => {
    it("should return 500 when an unexpected error is thrown", async () => {
      const throwingClient = {
        auth: createMockAuth({ id: "user1" }),
        storage: {
          from: jest.fn(() => ({
            createSignedUploadUrl: jest
              .fn()
              .mockRejectedValue(new Error("Unexpected crash")),
          })),
        },
      };

      setMockSupabaseClient(throwingClient);
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const body = await getJson(res);
      expect(res.status).toBe(500);
      expect(body.error).toContain("Unexpected error");
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers on all responses", async () => {
      setMockSupabaseClient(
        buildMockClient({ authUser: { id: "user1" } }),
      );
      handler = loadEdgeFunction("@/supabase/functions/get-upload-url/index");

      const res = await handler(
        makeRequest("http://localhost:9000/get-upload-url", {
          method: "POST",
          body: { file_ext: "jpg" },
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
